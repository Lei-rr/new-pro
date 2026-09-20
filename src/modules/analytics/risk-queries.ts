import { buildTimeScope } from '../../shared/sql.js'
import { buildInternalIpExclusion } from '../../shared/ip.js'
import type { TimeRangeFilter } from '../../core/time-range.js'
import type { RiskRules } from '../../config.js'

interface RiskContext {
  range: TimeRangeFilter
  rules: RiskRules
  nowSec: number
}

export interface RiskQuery {
  sql: string
  params: unknown[]
}

export function buildRiskQueries(ctx: RiskContext): {
  ipScan: RiskQuery
  burstScan: RiskQuery
  channelScan: RiskQuery
  extremeSlow: RiskQuery
} {
  const scope = buildTimeScope(ctx.range.startTime, ctx.range.endTime)
  const channelScope = buildTimeScope(ctx.range.startTime, ctx.range.endTime, 'l.created_at')
  const { rules } = ctx

  // 内网/白名单在 SQL 阶段即排除，避免占用 LIMIT 名额导致漏报
  const hasTimeFilter = scope.where !== ''
  const ipScanExclusion = buildInternalIpExclusion('ip', scope.params.length + 1, hasTimeFilter)
  // burstScan 的 WHERE 恒为 created_at >= $2
  const burstExclusion = buildInternalIpExclusion('ip', 4, true)

  const ipParams = [...scope.params, ...ipScanExclusion.params, rules.ipMinRequests]
  const burstParams = [ctx.nowSec - 60, ctx.nowSec - 300, ...burstExclusion.params, rules.ipMinRequests]
  const channelParams = [...channelScope.params, rules.channelMinRequests]
  const slowParams = [...scope.params, rules.extremeSlowMs]

  return {
    ipScan: {
      sql: `
        SELECT
          ip AS ip_addr,
          count(*) AS total_req,
          count(*) FILTER (WHERE type = 5) AS failed_req,
          COALESCE(sum(quota) FILTER (WHERE type = 2), 0) AS quota_used,
          array_agg(DISTINCT model_name) FILTER (WHERE model_name IS NOT NULL AND model_name != '') AS models,
          array_agg(DISTINCT token_name) FILTER (WHERE token_name IS NOT NULL AND token_name != '') AS tokens,
          to_char(timezone('Asia/Shanghai', to_timestamp(max(created_at))), 'YYYY-MM-DD HH24:MI:SS') AS last_seen
        FROM logs
        ${scope.where}
        ${ipScanExclusion.clause}
        GROUP BY ip
        HAVING count(*) >= $${ipParams.length}
        ORDER BY total_req DESC
        LIMIT 50
      `,
      params: ipParams,
    },
    burstScan: {
      sql: `
        SELECT
          ip AS ip_addr,
          count(*) AS burst_5m,
          count(*) FILTER (WHERE created_at >= $1) AS burst_1m,
          count(*) FILTER (WHERE type = 5) AS failed_5m,
          array_agg(DISTINCT model_name) FILTER (WHERE model_name IS NOT NULL AND model_name != '') AS burst_models,
          array_agg(DISTINCT token_name) FILTER (WHERE token_name IS NOT NULL AND token_name != '') AS burst_tokens
        FROM logs
        WHERE created_at >= $2 ${burstExclusion.clause}
        GROUP BY ip
        HAVING count(*) >= $${burstParams.length}
        ORDER BY burst_5m DESC
        LIMIT 25
      `,
      params: burstParams,
    },
    channelScan: {
      sql: `
        SELECT
          l.channel_id,
          COALESCE(c.name, '渠道 #' || l.channel_id::text) AS channel_name,
          c.status AS current_status,
          count(*) AS total_req,
          count(*) FILTER (WHERE l.type = 5) AS failed_req,
          COALESCE(round(avg(l.use_time * 1000) FILTER (WHERE l.use_time > 0)), 0) AS avg_latency,
          (SELECT content FROM logs
            WHERE channel_id = l.channel_id AND type = 5
            ORDER BY id DESC LIMIT 1) AS last_err
        FROM logs l
        LEFT JOIN channels c ON l.channel_id = c.id
        WHERE l.channel_id IS NOT NULL ${channelScope.and}
        GROUP BY l.channel_id, c.name, c.status
        HAVING count(*) >= $${channelParams.length}
        ORDER BY failed_req DESC
        LIMIT 20
      `,
      params: channelParams,
    },
    extremeSlow: {
      // use_time 单位为秒，阈值配置为毫秒，需换算后比较
      sql: `
        SELECT count(*) FILTER (WHERE use_time > $${slowParams.length}::numeric / 1000) AS extreme_slow
        FROM logs
        ${scope.where}
      `,
      params: slowParams,
    },
  }
}
