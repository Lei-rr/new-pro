import { buildTimeScope, timeBucketExpr } from '../../shared/sql.js'
import type { TimeRangeFilter } from '../../core/time-range.js'

export interface QueryDef {
  sql: string
  params: unknown[]
}

/** 大屏概览所需的全部查询 */
export interface OverviewQuerySet {
  /** 合并了总量、流式对比、延迟分级的单次聚合 */
  summary: QueryDef
  trend: QueryDef
  topChannels: QueryDef
  modelDistribution: QueryDef
  modelHealth: QueryDef
  activeIpSummary: QueryDef
}

export function buildOverviewQueries(
  range: TimeRangeFilter,
  granularity: 'hour' | 'day',
  knownIpLimit: number
): OverviewQuerySet {
  const scope = buildTimeScope(range.startTime, range.endTime)
  const logScope = buildTimeScope(range.startTime, range.endTime, 'l.created_at')
  const params = scope.params
  const { where, and } = scope
  const bucket = timeBucketExpr(granularity)

  /**
   * 趋势一律直接聚合 logs。
   *
   * 曾用 quota_data 账本表加速，但该表仅由 NewAPI 在「成功扣费」时写入，
   * 不含失败记录与响应耗时，导致 3 天以上区间的 failed / avgLatency 恒为 0
   * （线上 22 万次失败在图上完全不可见）。正确性优先，故统一走 logs。
   */
  const trendSql = `
      SELECT
        ${bucket} AS time_point,
        count(*) AS total,
        count(*) FILTER (WHERE type = 2) AS success,
        count(*) FILTER (WHERE type = 5) AS failed,
        COALESCE(sum(quota) FILTER (WHERE type = 2), 0) AS quota,
        COALESCE(sum(prompt_tokens + completion_tokens) FILTER (WHERE type = 2), 0) AS tokens,
        COALESCE(round(avg(use_time * 1000) FILTER (WHERE use_time > 0)), 0) AS avg_latency
      FROM logs
      ${where}
      GROUP BY time_point
      ORDER BY time_point ASC
    `

  return {
    /**
     * 汇总 + 流式对比 + 延迟分级三组标量指标合并为一次全表扫描。
     * 三者过滤条件高度重合，分开执行会重复扫描整表（实测 3×400ms → 1×470ms）。
     */
    summary: {
      sql: `
        SELECT
          count(*) AS total_requests,
          count(*) FILTER (WHERE type = 2) AS success_requests,
          count(*) FILTER (WHERE type = 5) AS failed_requests,
          COALESCE(sum(quota) FILTER (WHERE type = 2), 0) AS total_quota,
          COALESCE(sum(prompt_tokens) FILTER (WHERE type = 2), 0) AS prompt_tokens,
          COALESCE(sum(completion_tokens) FILTER (WHERE type = 2), 0) AS completion_tokens,
          COALESCE(round(avg(use_time * 1000) FILTER (WHERE use_time > 0)), 0) AS avg_latency,
          COALESCE(max(id), 0) AS max_log_id,
          count(*) FILTER (WHERE type = 2 AND is_stream) AS stream_count,
          count(*) FILTER (WHERE type = 2 AND NOT is_stream) AS non_stream_count,
          COALESCE(round(avg(use_time * 1000) FILTER (WHERE type = 2 AND is_stream AND use_time > 0)), 0) AS stream_latency,
          COALESCE(round(avg(use_time * 1000) FILTER (WHERE type = 2 AND NOT is_stream AND use_time > 0)), 0) AS non_stream_latency,
          COALESCE(sum(prompt_tokens + completion_tokens) FILTER (WHERE type = 2 AND is_stream), 0) AS stream_tokens,
          COALESCE(sum(prompt_tokens + completion_tokens) FILTER (WHERE type = 2 AND NOT is_stream), 0) AS non_stream_tokens,
          count(*) FILTER (WHERE type = 2 AND use_time < 0.5) AS p_fast,
          count(*) FILTER (WHERE type = 2 AND use_time >= 0.5 AND use_time < 1.5) AS p_normal,
          count(*) FILTER (WHERE type = 2 AND use_time >= 1.5 AND use_time < 3) AS p_slow,
          count(*) FILTER (WHERE type = 2 AND use_time >= 3) AS p_timeout,
          count(*) FILTER (WHERE type = 2) AS latency_total
        FROM logs
        ${where}
      `,
      params,
    },
    trend: { sql: trendSql, params },
    topChannels: {
      sql: `
        SELECT
          l.channel_id AS id,
          COALESCE(c.name, '渠道 #' || l.channel_id::text) AS name,
          count(*) AS count,
          count(*) FILTER (WHERE l.type = 5) AS failed,
          COALESCE(round(avg(l.use_time * 1000) FILTER (WHERE l.use_time > 0)), 0) AS avg_latency
        FROM logs l
        LEFT JOIN channels c ON l.channel_id = c.id
        WHERE l.channel_id IS NOT NULL ${logScope.and}
        GROUP BY l.channel_id, c.name
        ORDER BY count DESC
        LIMIT 8
      `,
      params,
    },
    modelDistribution: {
      // 单次扫描按「时段 × 模型」聚合后再筛 TOP5，
      // 避免先扫全表选 TOP5、再扫全表取明细的两遍扫描（实测 2.47s → 1.45s）
      sql: `
        WITH daily AS (
          SELECT
            ${bucket} AS time_point,
            model_name,
            count(*) AS cnt,
            COALESCE(sum(quota) FILTER (WHERE type = 2), 0) AS quota,
            COALESCE(sum(prompt_tokens + completion_tokens) FILTER (WHERE type = 2), 0) AS tokens
          FROM logs
          WHERE type = 2 AND model_name != '' ${and}
          GROUP BY time_point, model_name
        ),
        top_models AS (
          SELECT model_name
          FROM daily
          GROUP BY model_name
          ORDER BY sum(cnt) DESC
          LIMIT 5
        )
        SELECT d.time_point, d.model_name, d.quota, d.tokens
        FROM daily d
        JOIN top_models t ON t.model_name = d.model_name
        ORDER BY d.time_point ASC
      `,
      params,
    },
    modelHealth: {
      sql: `
        SELECT
          COALESCE(NULLIF(model_name, ''), '未知模型') AS model_name,
          count(*) AS total,
          count(*) FILTER (WHERE type = 2) AS success,
          COALESCE(round(avg(use_time * 1000) FILTER (WHERE use_time > 0)), 0) AS avg_latency
        FROM logs
        WHERE type IN (2, 5) ${and}
        GROUP BY model_name
        ORDER BY total DESC
        LIMIT 6
      `,
      params,
    },
    /**
     * 活跃 IP 总数与高频 IP 列表合并为单次分组扫描（分两次会重复扫描全表）。
     * 用窗口函数在 SQL 侧限制返回行数，避免公网场景下数万 IP 全量回传；
     * 总数由窗口列 total_count 携带，无需二次查询。
     */
    activeIpSummary: {
      sql: `
        SELECT ip, cnt, total_count
        FROM (
          SELECT
            ip,
            count(*) AS cnt,
            count(*) OVER () AS total_count,
            row_number() OVER (ORDER BY count(*) DESC) AS rn
          FROM logs
          ${where ? `${where} AND ip != ''` : `WHERE ip != ''`}
          GROUP BY ip
        ) ranked
        WHERE rn <= $${params.length + 1}
        ORDER BY cnt DESC
      `,
      params: [...params, knownIpLimit],
    },
  }
}
