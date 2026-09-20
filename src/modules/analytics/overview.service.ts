import { query } from '../../core/db.js'
import { MemoryCache, cached, registerCache } from '../../core/cache.js'
import { getConfig } from '../../config.js'
import { parseTimeRange, trendGranularity, type TimeRangeKey } from '../../core/time-range.js'
import { quotaToUsd, calcRate, round, toNumber } from '../../shared/calc.js'
import { buildOverviewQueries, type QueryDef } from './queries.js'
import type { OverviewMetrics, TrendItem } from './types.js'

const CACHE = registerCache('overview', new MemoryCache(64))

interface ResultRow {
  [column: string]: unknown
}

interface AggregateRow {
  time_point?: unknown
  total?: unknown
  success?: unknown
  failed?: unknown
  quota?: unknown
  tokens?: unknown
  avg_latency?: unknown
}

function firstRow<T extends ResultRow>(rows: T[]): T {
  return rows[0] ?? ({} as T)
}

function buildTrend(rows: AggregateRow[]): TrendItem[] {
  return rows.map((row) => ({
    timePoint: String(row.time_point ?? ''),
    total: toNumber(row.total),
    success: toNumber(row.success),
    failed: toNumber(row.failed),
    quota: toNumber(row.quota),
    tokens: toNumber(row.tokens),
    avgLatency: toNumber(row.avg_latency),
  }))
}

function buildModelDistribution(rows: ResultRow[]): OverviewMetrics['modelConsumptionDistribution'] {
  const timePoints = new Set<string>()
  const models = new Set<string>()
  const values = new Map<string, { quota: number; tokens: number }>()

  for (const row of rows) {
    const timePoint = String(row.time_point ?? '')
    const model = String(row.model_name ?? '')
    timePoints.add(timePoint)
    models.add(model)
    values.set(`${timePoint}@@${model}`, {
      quota: toNumber(row.quota),
      tokens: toNumber(row.tokens),
    })
  }

  const sortedTimePoints = Array.from(timePoints).sort()
  const modelList = Array.from(models)

  return {
    timePoints: sortedTimePoints,
    models: modelList,
    series: modelList.map((modelName) => ({
      modelName,
      quotaData: sortedTimePoints.map((tp) => values.get(`${tp}@@${modelName}`)?.quota ?? 0),
      tokensData: sortedTimePoints.map((tp) => values.get(`${tp}@@${modelName}`)?.tokens ?? 0),
    })),
  }
}

function buildStreamEfficiency(row: ResultRow): OverviewMetrics['streamEfficiency'] {
  const streamCount = toNumber(row.stream_count)
  const nonStreamCount = toNumber(row.non_stream_count)

  return {
    streamCount,
    nonStreamCount,
    streamPercentage: calcRate(streamCount, streamCount + nonStreamCount, 1),
    streamAvgLatency: toNumber(row.stream_latency),
    nonStreamAvgLatency: toNumber(row.non_stream_latency),
    streamTokens: toNumber(row.stream_tokens),
    nonStreamTokens: toNumber(row.non_stream_tokens),
  }
}

function buildLatencyBuckets(row: ResultRow): OverviewMetrics['latencyBuckets'] {
  const fastCount = toNumber(row.p_fast)
  const normalCount = toNumber(row.p_normal)
  const slowCount = toNumber(row.p_slow)
  const timeoutCount = toNumber(row.p_timeout)
  const total = toNumber(row.latency_total)

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
}

async function loadOverview(rangeKey: TimeRangeKey): Promise<OverviewMetrics> {
  const range = parseTimeRange(rangeKey)
  const granularity = trendGranularity(rangeKey)
  const knownIpLimit = getConfig().knownIpListLimit
  const queries = buildOverviewQueries(range, granularity, knownIpLimit)

  const run = (def: QueryDef) => query<ResultRow>(def.sql, def.params)

  const [
    summaryRes,
    trendRes,
    topChannelsRes,
    modelDistributionRes,
    modelHealthRes,
    activeIpSummaryRes,
  ] = await Promise.all([
    run(queries.summary),
    run(queries.trend),
    run(queries.topChannels),
    run(queries.modelDistribution),
    run(queries.modelHealth),
    run(queries.activeIpSummary),
  ])

  const summary = firstRow(summaryRes.rows)
  const totalRequests = toNumber(summary.total_requests)
  const successRequests = toNumber(summary.success_requests)
  const promptTokens = toNumber(summary.prompt_tokens)
  const completionTokens = toNumber(summary.completion_tokens)
  const totalQuota = toNumber(summary.total_quota)
  const successRate = calcRate(successRequests, totalRequests)
  const avgLatencyMs = toNumber(summary.avg_latency)
  const totalCostUsd = quotaToUsd(totalQuota)
  // 窗口列携带去重后的 IP 总数；行数已被 SQL 限制为 knownIpLimit
  const activeIps = toNumber(activeIpSummaryRes.rows[0]?.total_count)
  const knownIpList = activeIpSummaryRes.rows.map((row) => String(row.ip))

  const durationSec = range.endTime - range.startTime

  return {
    timeRange: range,
    summary: {
      totalRequests,
      successRequests,
      failedRequests: toNumber(summary.failed_requests),
      successRate,
      totalQuota,
      totalCostUsd,
      avgLatencyMs,
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      maxLogId: toNumber(summary.max_log_id),
      activeIps,
      avgReqPerIp: activeIps > 0 ? Math.round(totalRequests / activeIps) : 0,
      avgCostPerIp: activeIps > 0 ? round(totalCostUsd / activeIps, 2) : 0,
    },
    trend: buildTrend(trendRes.rows),
    topChannels: topChannelsRes.rows.map((row) => ({
      id: toNumber(row.id),
      name: String(row.name),
      count: toNumber(row.count),
      failed: toNumber(row.failed),
      avgLatency: toNumber(row.avg_latency),
    })),
    modelConsumptionDistribution: buildModelDistribution(modelDistributionRes.rows),
    performanceHealth: {
      systemSuccessRate: successRate,
      avgLatencyMs,
      tpsTokensPerSec:
        durationSec > 0 ? Math.round((promptTokens + completionTokens) / durationSec) : 0,
      topModelsHealth: modelHealthRes.rows.map((row) => {
        const total = toNumber(row.total)
        return {
          modelName: String(row.model_name),
          successRate: calcRate(toNumber(row.success), total, 1),
          count: total,
          avgLatency: toNumber(row.avg_latency),
        }
      }),
    },
    streamEfficiency: buildStreamEfficiency(summary),
    latencyBuckets: buildLatencyBuckets(summary),
    knownIpList,
    // 总数超出返回上限即说明被截断，此时集合不完整，前端不得据此推断新 IP
    knownIpListTruncated: activeIps > knownIpList.length,
  }
}

/**
 * 长期区间（3 天以上）需扫描全表，单次冷查询数秒；
 * 这类数据变化缓慢，用更长 TTL 摊薄成本，避免每次校准都触发全表扫描。
 */
function cacheTtlFor(rangeKey: TimeRangeKey): number {
  const config = getConfig()
  const isLongRange = rangeKey === '3d' || rangeKey === '7d' || rangeKey === '30d' || rangeKey === 'all'
  return isLongRange ? config.overviewLongCacheTtlMs : config.overviewCacheTtlMs
}

export function getDashboardOverview(rangeKey: TimeRangeKey = 'today'): Promise<OverviewMetrics> {
  return cached(CACHE, `overview:${rangeKey}`, cacheTtlFor(rangeKey), () => loadOverview(rangeKey))
}
