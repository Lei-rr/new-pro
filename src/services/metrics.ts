import { getDb } from '../db.js'
import { parseTimeRange } from './time-ranges.js'
import { memoryCache } from './cache.js'
import { getIpLocation } from './geoip.js'
import { quotaToUsd, calcRate } from './calc.js'
import type { OverviewMetrics, TimeRangeKey, ChannelStatusItem } from '../types/index.js'

export type { OverviewMetrics }

export async function getDashboardOverview(rangeKey: TimeRangeKey = 'today'): Promise<OverviewMetrics> {
  const cacheKey = `overview:${rangeKey}`
  const cached = memoryCache.get<OverviewMetrics>(cacheKey)
  if (cached) return cached

  const db = getDb()
  const filter = parseTimeRange(rangeKey)
  const params: unknown[] = []
  let timeCondition = ''
  let andTimeCondition = ''

  if (filter.startTime > 0) {
    params.push(filter.startTime, filter.endTime)
    timeCondition = 'WHERE created_at >= $1 AND created_at <= $2'
    andTimeCondition = 'AND created_at >= $1 AND created_at <= $2'
  }

  // 1. 总体概览数据：成功数(type=2)，失败数(type=5)，总配额，Token与耗时
  const summarySql = `
    SELECT 
      count(*) as total_requests,
      count(*) FILTER (WHERE type = 2) as success_requests,
      count(*) FILTER (WHERE type = 5) as failed_requests,
      COALESCE(sum(quota) FILTER (WHERE type = 2), 0) as total_quota,
      COALESCE(sum(prompt_tokens) FILTER (WHERE type = 2), 0) as prompt_tokens,
      COALESCE(sum(completion_tokens) FILTER (WHERE type = 2), 0) as completion_tokens,
      COALESCE(round(avg(use_time) FILTER (WHERE use_time > 0)), 0) as avg_latency,
      COALESCE(max(id), 0) as max_log_id
    FROM logs
    ${timeCondition}
  `

  // 2. 渠道实时状态
  const channelsSql = `
    SELECT id, name, type, status, priority, weight, response_time, test_time
    FROM channels
    ORDER BY priority DESC, id ASC
  `

  // 3. 时间序列趋势
  const isLongTerm = ['7d', '30d', 'all'].includes(rangeKey)
  const trendFormat = isLongTerm || rangeKey === '3d' ? 'YYYY-MM-DD' : 'YYYY-MM-DD HH24:00'

  const trendSql = isLongTerm
    ? `
      WITH historical AS (
        SELECT 
          to_char(timezone('Asia/Shanghai', to_timestamp(created_at)), '${trendFormat}') as time_point,
          sum(count) as total,
          sum(count) as success,
          0::bigint as failed,
          COALESCE(sum(quota), 0) as quota,
          COALESCE(sum(token_used), 0) as tokens,
          0::bigint as avg_latency
        FROM quota_data
        ${timeCondition}
        GROUP BY time_point
      ),
      recent AS (
        SELECT 
          to_char(timezone('Asia/Shanghai', to_timestamp(created_at)), '${trendFormat}') as time_point,
          count(*) as total,
          count(*) FILTER (WHERE type = 2) as success,
          count(*) FILTER (WHERE type = 5) as failed,
          COALESCE(sum(quota) FILTER (WHERE type = 2), 0) as quota,
          COALESCE(sum(prompt_tokens + completion_tokens) FILTER (WHERE type = 2), 0) as tokens,
          COALESCE(round(avg(use_time) FILTER (WHERE use_time > 0)), 0) as avg_latency
        FROM logs
        WHERE created_at > COALESCE((SELECT max(created_at) FROM quota_data), 0)
        ${andTimeCondition}
        GROUP BY time_point
      )
      SELECT 
        time_point,
        sum(total) as total,
        sum(success) as success,
        sum(failed) as failed,
        sum(quota) as quota,
        sum(tokens) as tokens,
        COALESCE(round(avg(NULLIF(avg_latency, 0))), 0) as avg_latency
      FROM (
        SELECT * FROM historical
        UNION ALL
        SELECT * FROM recent
      ) combined
      GROUP BY time_point
      ORDER BY time_point ASC
    `
    : `
      SELECT 
        to_char(timezone('Asia/Shanghai', to_timestamp(created_at)), '${trendFormat}') as time_point,
        count(*) as total,
        count(*) FILTER (WHERE type = 2) as success,
        count(*) FILTER (WHERE type = 5) as failed,
        COALESCE(sum(quota) FILTER (WHERE type = 2), 0) as quota,
        COALESCE(sum(prompt_tokens + completion_tokens) FILTER (WHERE type = 2), 0) as tokens,
        COALESCE(round(avg(use_time) FILTER (WHERE use_time > 0)), 0) as avg_latency
      FROM logs
      ${timeCondition}
      GROUP BY time_point
      ORDER BY time_point ASC
    `

  // 4. TOP 8 模型
  const topModelsSql = `
    SELECT 
      COALESCE(NULLIF(model_name, ''), '未知模型') as name,
      count(*) as count,
      COALESCE(sum(quota), 0) as quota,
      COALESCE(sum(prompt_tokens + completion_tokens), 0) as tokens
    FROM logs
    WHERE type = 2 ${andTimeCondition}
    GROUP BY name
    ORDER BY count DESC
    LIMIT 8
  `

  // 5. TOP 8 用户
  const topUsersSql = `
    SELECT 
      COALESCE(NULLIF(username, ''), '未知用户') as name,
      count(*) as count,
      COALESCE(sum(quota), 0) as quota
    FROM logs
    WHERE type = 2 ${andTimeCondition}
    GROUP BY name
    ORDER BY count DESC
    LIMIT 8
  `

  // 6. TOP 8 渠道
  const topChannelsSql = `
    SELECT 
      l.channel_id as id,
      COALESCE(c.name, '渠道 #' || l.channel_id::text) as name,
      count(*) as count,
      count(*) FILTER (WHERE l.type = 5) as failed,
      COALESCE(round(avg(l.use_time) FILTER (WHERE l.use_time > 0)), 0) as avg_latency
    FROM logs l
    LEFT JOIN channels c ON l.channel_id = c.id
    WHERE l.channel_id IS NOT NULL ${andTimeCondition}
    GROUP BY l.channel_id, c.name
    ORDER BY count DESC
    LIMIT 8
  `

  // 7. 数据库基础总量
  const dbStatsSql = `
    SELECT 
      (SELECT count(*) FROM channels) as channels_count,
      (SELECT count(*) FROM users) as users_count,
      (SELECT COALESCE(max(id), 0) FROM logs) as logs_count
  `

  // 8. TOP 5 模型消耗分布矩阵
  const modelDistSql = `
    WITH target_top_models AS (
      SELECT model_name
      FROM logs
      WHERE type = 2 ${andTimeCondition} AND model_name != ''
      GROUP BY model_name
      ORDER BY count(*) DESC
      LIMIT 5
    )
    SELECT 
      to_char(timezone('Asia/Shanghai', to_timestamp(created_at)), '${trendFormat}') as time_point,
      model_name,
      COALESCE(sum(quota) FILTER (WHERE type = 2), 0) as quota,
      COALESCE(sum(prompt_tokens + completion_tokens) FILTER (WHERE type = 2), 0) as tokens
    FROM logs
    WHERE type = 2 ${andTimeCondition}
      AND model_name IN (SELECT model_name FROM target_top_models)
    GROUP BY time_point, model_name
    ORDER BY time_point ASC
  `

  // 9. 头部模型健康率
  const modelHealthSql = `
    SELECT 
      COALESCE(NULLIF(model_name, ''), '未知模型') as model_name,
      count(*) as total,
      count(*) FILTER (WHERE type = 2) as success,
      COALESCE(round(avg(use_time) FILTER (WHERE use_time > 0)), 0) as avg_latency
    FROM logs
    WHERE type IN (2, 5) ${andTimeCondition}
    GROUP BY model_name
    ORDER BY total DESC
    LIMIT 6
  `

  // 10. 流式吞吐对比
  const streamSql = `
    SELECT 
      is_stream,
      count(*) as count,
      COALESCE(round(avg(use_time) FILTER (WHERE use_time > 0)), 0) as avg_latency,
      COALESCE(sum(prompt_tokens + completion_tokens) FILTER (WHERE type = 2), 0) as tokens
    FROM logs
    WHERE type = 2 ${andTimeCondition}
    GROUP BY is_stream
  `

  // 11. 延迟阶梯分级
  const latencyBucketsSql = `
    SELECT 
      count(*) as total,
      count(*) FILTER (WHERE use_time < 500) as p_fast,
      count(*) FILTER (WHERE use_time >= 500 AND use_time < 1500) as p_normal,
      count(*) FILTER (WHERE use_time >= 1500 AND use_time < 3000) as p_slow,
      count(*) FILTER (WHERE use_time >= 3000) as p_timeout
    FROM logs
    WHERE type = 2 ${andTimeCondition}
  `

  // 12. IP 排行榜
  const topIpsSql = `
    SELECT 
      COALESCE(NULLIF(ip, ''), '未知IP') as ip,
      count(*) as count,
      COALESCE(sum(prompt_tokens + completion_tokens) FILTER (WHERE type = 2), 0) as tokens,
      COALESCE(sum(quota) FILTER (WHERE type = 2), 0) as quota,
      count(*) FILTER (WHERE type = 5) as failed
    FROM logs
    WHERE ip != '' ${andTimeCondition}
    GROUP BY ip
    ORDER BY count DESC
    LIMIT 10
  `

  // 13. 周期活跃 IP 终端规模与已知 IP 集合
  const activeScaleSql = `
    SELECT 
      count(DISTINCT NULLIF(ip, '')) as active_ips
    FROM logs
    ${timeCondition}
  `

  const activeIpsWhere = timeCondition ? `${timeCondition} AND ip != ''` : `WHERE ip != ''`
  const activeIpsListSql = `
    SELECT DISTINCT ip
    FROM logs
    ${activeIpsWhere}
  `

  // 并行执行高性能聚合查询
  const [
    summaryRes,
    channelsRes,
    trendRes,
    topModelsRes,
    topUsersRes,
    topChannelsRes,
    dbStatsRes,
    modelDistRes,
    modelHealthRes,
    streamRes,
    latencyBucketsRes,
    topIpsRes,
    activeScaleRes,
    activeIpsListRes,
  ] = await Promise.all([
    db.query(summarySql, params),
    db.query(channelsSql),
    db.query(trendSql, params),
    db.query(topModelsSql, params),
    db.query(topUsersSql, params),
    db.query(topChannelsSql, params),
    db.query(dbStatsSql),
    db.query(modelDistSql, params),
    db.query(modelHealthSql, params),
    db.query(streamSql, params),
    db.query(latencyBucketsSql, params),
    db.query(topIpsSql, params),
    db.query(activeScaleSql, params),
    db.query(activeIpsListSql, params),
  ])

  const sRow = summaryRes.rows[0] || {}
  const totalRequests = Number(sRow.total_requests || 0)
  const successRequests = Number(sRow.success_requests || 0)
  const failedRequests = Number(sRow.failed_requests || 0)
  const totalQuota = Number(sRow.total_quota || 0)
  const promptTokens = Number(sRow.prompt_tokens || 0)
  const completionTokens = Number(sRow.completion_tokens || 0)
  const totalTokens = promptTokens + completionTokens
  const avgLatencyMs = Number(sRow.avg_latency || 0)
  const successRate = calcRate(successRequests, totalRequests)
  const totalCostUsd = quotaToUsd(totalQuota)

  const allChannels: ChannelStatusItem[] = channelsRes.rows.map((r: any) => ({
    id: Number(r.id),
    name: r.name || `渠道 #${r.id}`,
    type: Number(r.type || 1),
    status: Number(r.status ?? 1),
    priority: Number(r.priority || 0),
    weight: Number(r.weight || 0),
    responseTime: Number(r.response_time || 0),
    testTime: Number(r.test_time || 0),
  }))

  const activeChannels = allChannels.filter((c) => c.status === 1).length
  const activeIps = Number(activeScaleRes.rows[0]?.active_ips || 0)
  const avgReqPerIp = activeIps > 0 ? Math.round(totalRequests / activeIps) : 0
  const avgCostPerIp = activeIps > 0 ? Number((totalCostUsd / activeIps).toFixed(2)) : 0

  const result: OverviewMetrics = {
    timeRange: filter,
    summary: {
      totalRequests,
      successRequests,
      failedRequests,
      successRate,
      totalQuota,
      totalCostUsd,
      avgLatencyMs,
      promptTokens,
      completionTokens,
      totalTokens,
      maxLogId: Number(sRow.max_log_id || 0),
      activeIps,
      avgReqPerIp,
      avgCostPerIp,
    },
    channelsStatus: {
      total: allChannels.length,
      active: activeChannels,
      disabled: allChannels.length - activeChannels,
      channels: allChannels,
    },
    trend: trendRes.rows.map((r: any) => ({
      timePoint: r.time_point,
      total: Number(r.total || 0),
      success: Number(r.success || 0),
      failed: Number(r.failed || 0),
      quota: Number(r.quota || 0),
      tokens: Number(r.tokens || 0),
      avgLatency: Number(r.avg_latency || 0),
    })),
    topModels: topModelsRes.rows.map((r: any) => ({
      name: r.name,
      count: Number(r.count || 0),
      quota: Number(r.quota || 0),
      tokens: Number(r.tokens || 0),
    })),
    topUsers: topUsersRes.rows.map((r: any) => ({
      name: r.name,
      count: Number(r.count || 0),
      quota: Number(r.quota || 0),
    })),
    topChannels: topChannelsRes.rows.map((r: any) => ({
      id: Number(r.id),
      name: r.name,
      count: Number(r.count || 0),
      failed: Number(r.failed || 0),
      avgLatency: Number(r.avg_latency || 0),
    })),
    dbStats: {
      totalLogsInDb: Number(dbStatsRes.rows[0]?.logs_count || 0),
      activeChannelsCount: activeChannels,
      totalUsersCount: Number(dbStatsRes.rows[0]?.users_count || 0),
    },
    modelConsumptionDistribution: (() => {
      const timePointSet = new Set<string>()
      const modelSet = new Set<string>()
      const valMap = new Map<string, { quota: number; tokens: number }>()

      for (const r of modelDistRes.rows) {
        const tp = String(r.time_point)
        const mn = String(r.model_name)
        timePointSet.add(tp)
        modelSet.add(mn)
        valMap.set(`${tp}@@@${mn}`, {
          quota: Number(r.quota || 0),
          tokens: Number(r.tokens || 0),
        })
      }

      const timePoints = Array.from(timePointSet).sort()
      const models = Array.from(modelSet)

      const series = models.map((mn) => {
        const quotaData = timePoints.map((tp) => valMap.get(`${tp}@@@${mn}`)?.quota || 0)
        const tokensData = timePoints.map((tp) => valMap.get(`${tp}@@@${mn}`)?.tokens || 0)
        return {
          modelName: mn,
          quotaData,
          tokensData,
        }
      })

      return {
        timePoints,
        models,
        series,
      }
    })(),
    performanceHealth: {
      systemSuccessRate: successRate,
      avgLatencyMs,
      tpsTokensPerSec: filter.startTime > 0 && (filter.endTime - filter.startTime > 0)
        ? Math.round(totalTokens / (filter.endTime - filter.startTime))
        : 0,
      topModelsHealth: modelHealthRes.rows.map((r: any) => {
        const tot = Number(r.total || 0)
        const succ = Number(r.success || 0)
        return {
          modelName: String(r.model_name),
          successRate: calcRate(succ, tot, 1),
          count: tot,
          avgLatency: Number(r.avg_latency || 0),
        }
      }),
    },
    streamEfficiency: (() => {
      let streamCount = 0
      let nonStreamCount = 0
      let streamAvgLatency = 0
      let nonStreamAvgLatency = 0
      let streamTokens = 0
      let nonStreamTokens = 0

      for (const r of streamRes.rows) {
        if (r.is_stream === true) {
          streamCount = Number(r.count || 0)
          streamAvgLatency = Number(r.avg_latency || 0)
          streamTokens = Number(r.tokens || 0)
        } else {
          nonStreamCount = Number(r.count || 0)
          nonStreamAvgLatency = Number(r.avg_latency || 0)
          nonStreamTokens = Number(r.tokens || 0)
        }
      }
      const total = streamCount + nonStreamCount
      return {
        streamCount,
        nonStreamCount,
        streamPercentage: calcRate(streamCount, total, 1),
        streamAvgLatency,
        nonStreamAvgLatency,
        streamTokens,
        nonStreamTokens,
      }
    })(),
    latencyBuckets: (() => {
      const b = latencyBucketsRes.rows[0] || {}
      const total = Number(b.total || 0)
      const fastCount = Number(b.p_fast || 0)
      const normalCount = Number(b.p_normal || 0)
      const slowCount = Number(b.p_slow || 0)
      const timeoutCount = Number(b.p_timeout || 0)

      return {
        fastCount,
        normalCount,
        slowCount,
        timeoutCount,
        fastPct: calcRate(fastCount, total, 1),
        normalPct: calcRate(normalCount, total, 1),
        slowPct: calcRate(slowCount, total, 1),
        timeoutPct: calcRate(timeoutCount, total, 1),
      }
    })(),
    topIps: await Promise.all(
      topIpsRes.rows.map(async (r: any) => {
        const q = Number(r.quota || 0)
        const ipStr = String(r.ip)
        return {
          ip: ipStr,
          location: await getIpLocation(ipStr),
          count: Number(r.count || 0),
          tokens: Number(r.tokens || 0),
          quota: q,
          costUsd: quotaToUsd(q),
          failed: Number(r.failed || 0),
        }
      })
    ),
    knownIpList: activeIpsListRes.rows.map((r: any) => String(r.ip)),
  }

  // 写入缓存 4 秒 (平滑前端切换且避免瞬间高频击穿)
  memoryCache.set(cacheKey, result, 4000)

  return result
}
