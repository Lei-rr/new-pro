import { query } from '../../core/db.js'
import { MemoryCache, cached, registerCache } from '../../core/cache.js'
import { getConfig } from '../../config.js'
import { parseGatewayErrorCode } from '../../shared/log-error.js'
import { calcRate, formatShanghaiTime, toNumber } from '../../shared/calc.js'
import { resolveIpLocations } from '../../services/geoip.js'
import type { RealtimePulse, RealtimePulseLog } from './types.js'

const REALTIME_CACHE = registerCache('realtime', new MemoryCache(64))
/** 缓存窗口略小于推流间隔，既合并并发查询又保证心跳数据新鲜 */
const REALTIME_TTL_MS = Math.max(500, getConfig().pulseIntervalSec * 1000 - 250)
const RECENT_LOG_LIMIT = 15

/**
 * 吞吐统计口径与 NewAPI 保持一致：只计入成功请求（type = 2）。
 * 失败请求（type = 5）单独由 successRate1m / failedRequests 呈现，
 * 若混入吞吐会导致数值高于 NewAPI 首页（线上失败占比可达 40%+）。
 */
const THROUGHPUT_SQL = `
  SELECT
    count(*) FILTER (WHERE created_at >= $1 AND type = 2) AS success_10s,
    count(*) FILTER (WHERE created_at >= $2 AND type = 2) AS success_1m,
    count(*) FILTER (WHERE created_at >= $3 AND type = 2) AS success_5m,
    count(*) FILTER (WHERE created_at >= $2 AND type = 5) AS failed_1m,
    COALESCE(sum(prompt_tokens + completion_tokens) FILTER (WHERE created_at >= $2 AND type = 2), 0) AS tokens_1m,
    COALESCE(round(avg(use_time * 1000) FILTER (WHERE created_at >= $2 AND type = 2 AND use_time > 0)), 0) AS avg_latency_1m,
    count(DISTINCT ip) FILTER (WHERE created_at >= $3 AND type = 2) AS ips_5m,
    count(DISTINCT ip) FILTER (WHERE created_at >= $4 AND type = 2) AS ips_30m
  FROM logs
  WHERE created_at >= $4
`

const RECENT_LOGS_SQL = `
  SELECT
    l.id,
    l.created_at,
    l.type,
    COALESCE(NULLIF(l.model_name, ''), '-') AS model,
    COALESCE(c.name, '渠道 #' || COALESCE(l.channel_id::text, '-')) AS channel_name,
    COALESCE(NULLIF(l.token_name, ''), '-') AS token_name,
    COALESCE(NULLIF(l.username, ''), '系统') AS username,
    COALESCE(NULLIF(l.ip, ''), '-') AS ip,
    l.is_stream,
    l.quota,
    COALESCE(l.prompt_tokens, 0) AS prompt_tokens,
    COALESCE(l.completion_tokens, 0) AS completion_tokens,
    COALESCE(l.prompt_tokens + l.completion_tokens, 0) AS total_tokens,
    l.use_time,
    CASE
      WHEN l.other IS NULL OR l.other = '' THEN NULL
      ELSE NULLIF((l.other::json -> 'frt')::text, 'null')::numeric
    END AS frt_ms,
    CASE
      WHEN l.other IS NULL OR l.other = '' THEN NULL
      ELSE NULLIF((l.other::json -> 'cache_tokens')::text, 'null')::numeric
    END AS cache_tokens,
    l.content
  FROM logs l
  LEFT JOIN channels c ON l.channel_id = c.id
  ORDER BY l.id DESC
  LIMIT ${RECENT_LOG_LIMIT}
`

interface ThroughputRow {
  success_10s?: unknown
  success_1m?: unknown
  success_5m?: unknown
  failed_1m?: unknown
  tokens_1m?: unknown
  avg_latency_1m?: unknown
  ips_5m?: unknown
  ips_30m?: unknown
}

interface RecentLogRow {
  id: unknown
  created_at: unknown
  type: unknown
  model: unknown
  channel_name: unknown
  token_name: unknown
  username: unknown
  ip: unknown
  is_stream: unknown
  quota: unknown
  prompt_tokens: unknown
  completion_tokens: unknown
  total_tokens: unknown
  use_time: unknown
  frt_ms: unknown
  cache_tokens: unknown
  content: unknown
}

/** 解析 other.frt（首字延迟，毫秒）；缺失或非法值返回 undefined */
function parseFirstTokenMs(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined
  const num = Number(value)
  return Number.isFinite(num) && num >= 0 ? Math.round(num) : undefined
}

/** 解析 other.cache_tokens（命中缓存的输入 token 数）；缺失或非法值返回 0 */
function parseCacheTokens(value: unknown): number {
  if (value === null || value === undefined) return 0
  const num = Number(value)
  return Number.isFinite(num) && num > 0 ? Math.round(num) : 0
}

function resolveLogStatus(type: number): RealtimePulseLog['status'] {
  if (type === 2) return 'success'
  if (type === 5) return 'failed'
  return 'other'
}

async function loadRecentLogs(rows: RecentLogRow[]): Promise<RealtimePulseLog[]> {
  const locations = await resolveIpLocations(rows.map((row) => String(row.ip || '')))

  return rows.map((row) => {
    const type = toNumber(row.type)
    const content = String(row.content || '')
    const ip = String(row.ip || '')
    return {
      id: toNumber(row.id),
      createdAt: formatShanghaiTime(toNumber(row.created_at)),
      type,
      model: String(row.model),
      channelName: String(row.channel_name),
      tokenName: String(row.token_name),
      username: String(row.username),
      ip,
      ipLocation: locations.get(ip),
      isStream: row.is_stream === true,
      quota: toNumber(row.quota),
      promptTokens: toNumber(row.prompt_tokens),
      completionTokens: toNumber(row.completion_tokens),
      totalTokens: toNumber(row.total_tokens),
      // use_time 在 NewAPI 中以秒存储，统一换算为毫秒对外输出
      useTime: Math.round(toNumber(row.use_time) * 1000),
      firstTokenMs: parseFirstTokenMs(row.frt_ms),
      cacheTokens: parseCacheTokens(row.cache_tokens),
      status: resolveLogStatus(type),
      errorCode: type === 5 ? parseGatewayErrorCode(content) : undefined,
      errorDetail: type === 5 && content ? content : undefined,
    }
  })
}

async function loadRealtimePulse(): Promise<RealtimePulse> {
  const nowSec = Math.floor(Date.now() / 1000)

  const [throughputRes, logsRes] = await Promise.all([
    query<ThroughputRow>(THROUGHPUT_SQL, [nowSec - 10, nowSec - 60, nowSec - 300, nowSec - 1800]),
    query<RecentLogRow>(RECENT_LOGS_SQL),
  ])

  const tp = throughputRes.rows[0] ?? {}
  const success10s = toNumber(tp.success_10s)
  const success1m = toNumber(tp.success_1m)
  const failed1m = toNumber(tp.failed_1m)

  return {
    timestamp: nowSec,
    // QPS / RPM 均为成功请求速率，与 NewAPI 口径一致
    qps: Number((success10s / 10).toFixed(1)),
    rpm: success1m,
    tpm: toNumber(tp.tokens_1m),
    activeIps5m: toNumber(tp.ips_5m),
    activeIps30m: toNumber(tp.ips_30m),
    avgLatency1m: toNumber(tp.avg_latency_1m),
    // 成功率基于成功 + 失败两类终态请求计算，不含管理类日志
    successRate1m: calcRate(success1m, success1m + failed1m, 1),
    recentLogs: await loadRecentLogs(logsRes.rows),
  }
}

/** 秒级实时心跳：短 TTL 合并并发请求，避免 WebSocket 与 HTTP 兜底重复查库 */
export function getRealtimePulse(): Promise<RealtimePulse> {
  return cached(REALTIME_CACHE, 'pulse', REALTIME_TTL_MS, loadRealtimePulse)
}
