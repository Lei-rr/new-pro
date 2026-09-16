import { query } from '../db.js'
import { parseTimeRange } from './time-ranges.js'
import { memoryCache } from './cache.js'
import { getIpLocation } from './geoip.js'
import { quotaToUsd, calcRate } from './calc.js'
import type {
  DimensionType,
  DimensionItem,
  DimensionAnalysisResult,
  TimeRangeKey,
} from '../types/index.js'

export type { DimensionType, DimensionItem, DimensionAnalysisResult }

export async function getDimensionAnalysis(
  dimension: DimensionType,
  rangeKey: TimeRangeKey = 'today',
  limit: number = 50
): Promise<DimensionAnalysisResult> {
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200)
  const cacheKey = `dimension:${dimension}:${rangeKey}:${safeLimit}`
  const cached = memoryCache.get<DimensionAnalysisResult>(cacheKey)
  if (cached) return cached

  const filter = parseTimeRange(rangeKey)
  const whereClauses: string[] = ['l.type IN (2, 5)']
  const params: unknown[] = []

  if (filter.startTime > 0) {
    params.push(filter.startTime, filter.endTime)
    whereClauses.push(`l.created_at >= $${params.length - 1} AND l.created_at <= $${params.length}`)
  }

  const timeCondition = `WHERE ${whereClauses.join(' AND ')}`

  let selectField = ''
  let groupField = ''
  let joinClause = ''

  switch (dimension) {
    case 'group':
      selectField = `COALESCE(NULLIF(l."group", ''), '默认分组(default)') as entity_id, COALESCE(NULLIF(l."group", ''), 'default') as entity_name`
      groupField = `l."group"`
      break
    case 'user':
      selectField = `COALESCE(NULLIF(l.username, ''), '未知用户') as entity_id, COALESCE(NULLIF(l.username, ''), '未知用户') as entity_name`
      groupField = `l.username`
      break
    case 'channel':
      selectField = `COALESCE(l.channel_id::text, '0') as entity_id, COALESCE(c.name, '渠道 #' || COALESCE(l.channel_id::text, '未知')) as entity_name`
      joinClause = `LEFT JOIN channels c ON l.channel_id = c.id`
      groupField = `l.channel_id, c.name`
      break
    case 'ip':
      selectField = `COALESCE(NULLIF(l.ip, ''), '未知IP') as entity_id, COALESCE(NULLIF(l.ip, ''), '未知IP') as entity_name`
      groupField = `l.ip`
      break
    case 'model':
    default:
      selectField = `COALESCE(NULLIF(l.model_name, ''), '未知模型') as entity_id, COALESCE(NULLIF(l.model_name, ''), '未知模型') as entity_name`
      groupField = `l.model_name`
      break
  }

  params.push(safeLimit)
  const limitPlaceholder = `$${params.length}`

  const querySql = `
    SELECT 
      ${selectField},
      count(*) as total_requests,
      count(*) FILTER (WHERE l.type = 2) as success_requests,
      count(*) FILTER (WHERE l.type = 5) as failed_requests,
      COALESCE(sum(l.quota) FILTER (WHERE l.type = 2), 0) as total_quota,
      COALESCE(sum(l.prompt_tokens) FILTER (WHERE l.type = 2), 0) as prompt_tokens,
      COALESCE(sum(l.completion_tokens) FILTER (WHERE l.type = 2), 0) as completion_tokens,
      COALESCE(round(avg(l.use_time) FILTER (WHERE l.use_time > 0)), 0) as avg_latency,
      to_char(timezone('Asia/Shanghai', to_timestamp(min(l.created_at))), 'YYYY-MM-DD HH24:MI:SS') as first_seen,
      to_char(timezone('Asia/Shanghai', to_timestamp(max(l.created_at))), 'YYYY-MM-DD HH24:MI:SS') as last_seen
    FROM logs l
    ${joinClause}
    ${timeCondition}
    GROUP BY ${groupField}
    ORDER BY total_requests DESC
    LIMIT ${limitPlaceholder}
  `

  const res = await query(querySql, params)

  const items: DimensionItem[] = await Promise.all(
    res.rows.map(async (r: any) => {
      const total = Number(r.total_requests || 0)
      const success = Number(r.success_requests || 0)
      const failed = Number(r.failed_requests || 0)
      const quota = Number(r.total_quota || 0)
      const promptTokens = Number(r.prompt_tokens || 0)
      const completionTokens = Number(r.completion_tokens || 0)
      const avgLatency = Number(r.avg_latency || 0)
      const successRate = calcRate(success, total)
      const entityId = String(r.entity_id)

      let location: string | undefined
      if (dimension === 'ip') {
        location = await getIpLocation(entityId)
      }

      return {
        id: entityId,
        name: String(r.entity_name),
        location,
        totalRequests: total,
        successRequests: success,
        failedRequests: failed,
        successRate,
        totalQuota: quota,
        costUsd: quotaToUsd(quota),
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
        avgLatencyMs: avgLatency,
        firstSeen: r.first_seen,
        lastSeen: r.last_seen,
      }
    })
  )

  const result: DimensionAnalysisResult = {
    dimension,
    timeRange: filter,
    totalEntities: items.length,
    items,
  }

  // 写入缓存 4 秒
  memoryCache.set(cacheKey, result, 4000)

  return result
}
