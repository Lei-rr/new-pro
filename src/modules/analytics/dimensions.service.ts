import { query } from '../../core/db.js'
import { MemoryCache, cached, registerCache } from '../../core/cache.js'
import { getConfig } from '../../config.js'
import { parseTimeRange, type TimeRangeKey } from '../../core/time-range.js'
import { quotaToUsd, calcRate, toNumber } from '../../shared/calc.js'
import { resolveIpLocations } from '../../services/geoip.js'
import { buildDimensionQuery } from './dimension-queries.js'
import type { DimensionAnalysisResult, DimensionItem, DimensionType } from './types.js'

const CACHE = registerCache('dimensions', new MemoryCache(256))

interface DimensionRow {
  [column: string]: unknown
}

export async function loadDimensionAnalysis(
  dimension: DimensionType,
  rangeKey: TimeRangeKey,
  limit: number
): Promise<DimensionAnalysisResult> {
  const range = parseTimeRange(rangeKey)
  const { sql, params } = buildDimensionQuery(dimension, range, limit)
  const res = await query<DimensionRow>(sql, params)

  const locations =
    dimension === 'ip'
      ? await resolveIpLocations(res.rows.map((row) => String(row.entity_id ?? '')))
      : null

  const items: DimensionItem[] = res.rows.map((row) => {
    const entityId = String(row.entity_id ?? '')
    const total = toNumber(row.total_requests)
    const quota = toNumber(row.total_quota)
    const promptTokens = toNumber(row.prompt_tokens)
    const completionTokens = toNumber(row.completion_tokens)

    return {
      id: entityId,
      name: String(row.entity_name ?? ''),
      location: locations?.get(entityId),
      totalRequests: total,
      successRequests: toNumber(row.success_requests),
      failedRequests: toNumber(row.failed_requests),
      successRate: calcRate(toNumber(row.success_requests), total),
      totalQuota: quota,
      costUsd: quotaToUsd(quota),
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      avgLatencyMs: toNumber(row.avg_latency),
      firstSeen: String(row.first_seen ?? ''),
      lastSeen: String(row.last_seen ?? ''),
    }
  })

  return {
    dimension,
    timeRange: range,
    totalEntities: items.length,
    items,
  }
}

export function getDimensionAnalysis(
  dimension: DimensionType,
  rangeKey: TimeRangeKey = 'today',
  limit = 50
): Promise<DimensionAnalysisResult> {
  return cached(CACHE, `dimension:${dimension}:${rangeKey}:${limit}`, getConfig().dimensionCacheTtlMs, () =>
    loadDimensionAnalysis(dimension, rangeKey, limit)
  )
}
