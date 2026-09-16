import { query } from '../db.js'
import { getIpLocation } from './geoip.js'
import { calcRate } from './calc.js'
import type { RealtimePulse, RealtimePulseLog } from '../types/index.js'

export type { RealtimePulse, RealtimePulseLog }

export async function getRealtimePulse(): Promise<RealtimePulse> {
  const now = Math.floor(Date.now() / 1000)
  const oneMinAgo = now - 60
  const tenSecAgo = now - 10
  const fiveMinAgo = now - 300
  const thirtyMinAgo = now - 1800

  // 1. 过去 10 秒 / 1 分钟 / 5 分钟吞吐量与活跃终端统计
  const throughputSql = `
    SELECT 
      count(*) FILTER (WHERE created_at >= $1) as req_10s,
      count(*) FILTER (WHERE created_at >= $2) as req_1m,
      count(*) FILTER (WHERE created_at >= $3) as req_5m,
      count(*) FILTER (WHERE created_at >= $2 AND type = 2) as success_1m,
      count(*) FILTER (WHERE created_at >= $2 AND type = 5) as failed_1m,
      COALESCE(sum(prompt_tokens + completion_tokens) FILTER (WHERE created_at >= $2 AND type = 2), 0) as tokens_1m,
      COALESCE(round(avg(use_time) FILTER (WHERE created_at >= $2 AND use_time > 0)), 0) as avg_latency_1m,
      count(DISTINCT ip) FILTER (WHERE created_at >= $2) as ips_1m,
      count(DISTINCT ip) FILTER (WHERE created_at >= $3) as ips_5m,
      count(DISTINCT ip) FILTER (WHERE created_at >= $4) as ips_30m,
      count(DISTINCT username) FILTER (WHERE created_at >= $2) as users_1m
    FROM logs
    WHERE created_at >= $4
  `

  // 2. 最近 15 条实时流日志
  const recentLogsSql = `
    SELECT 
      l.id,
      l.created_at,
      l.type,
      COALESCE(NULLIF(l.model_name, ''), '-') as model,
      COALESCE(c.name, '渠道 #' || COALESCE(l.channel_id::text, '-')) as channel_name,
      COALESCE(NULLIF(l.username, ''), '系统') as username,
      COALESCE(NULLIF(l.ip, ''), '-') as ip,
      l.quota,
      COALESCE(l.prompt_tokens, 0) as prompt_tokens,
      COALESCE(l.completion_tokens, 0) as completion_tokens,
      COALESCE(l.prompt_tokens + l.completion_tokens, 0) as total_tokens,
      l.use_time,
      l.content
    FROM logs l
    LEFT JOIN channels c ON l.channel_id = c.id
    ORDER BY l.id DESC
    LIMIT 15
  `

  const [tpRes, logsRes] = await Promise.all([
    query(throughputSql, [tenSecAgo, oneMinAgo, fiveMinAgo, thirtyMinAgo]),
    query(recentLogsSql),
  ])

  const tp = tpRes.rows[0] || {}
  const req10s = Number(tp.req_10s || 0)
  const req1m = Number(tp.req_1m || 0)
  const req5m = Number(tp.req_5m || 0)
  const success1m = Number(tp.success_1m || 0)
  const tokens1m = Number(tp.tokens_1m || 0)
  const avgLatency1m = Number(tp.avg_latency_1m || 0)
  const ips1m = Number(tp.ips_1m || 0)
  const ips5m = Number(tp.ips_5m || 0)
  const ips30m = Number(tp.ips_30m || 0)
  const users1m = Number(tp.users_1m || 0)

  const qps = Number((req10s / 10).toFixed(1))
  const rpm = req1m
  const tpm = tokens1m
  const successRate1m = calcRate(success1m, req1m, 1)

  const recentLogs: RealtimePulseLog[] = await Promise.all(
    logsRes.rows.map(async (r: any) => {
      const logType = Number(r.type)
      const content = String(r.content || '')
      const ipStr = String(r.ip || '')
      let errorCode = ''

      if (logType === 5) {
        const match = content.match(/status_code=(\d{3})/)
        if (match) {
          errorCode = match[1]
        } else if (content.includes('429')) {
          errorCode = '429'
        } else if (content.includes('500')) {
          errorCode = '500'
        } else if (content.includes('502')) {
          errorCode = '502'
        } else if (content.includes('503')) {
          errorCode = '503'
        } else if (content.includes('400')) {
          errorCode = '400'
        } else {
          errorCode = 'ERR'
        }
      }

      const ipLocation = ipStr && ipStr !== '-' ? await getIpLocation(ipStr) : undefined

      return {
        id: Number(r.id),
        createdAt: new Date(Number(r.created_at) * 1000).toLocaleTimeString('zh-CN', {
          timeZone: 'Asia/Shanghai',
          hour12: false,
        }),
        type: logType,
        model: String(r.model),
        channelName: String(r.channel_name),
        username: String(r.username),
        ip: ipStr,
        ipLocation,
        quota: Number(r.quota || 0),
        promptTokens: Number(r.prompt_tokens || 0),
        completionTokens: Number(r.completion_tokens || 0),
        totalTokens: Number(r.total_tokens || 0),
        useTime: Number(r.use_time || 0),
        status: logType === 2 ? 'success' : (logType === 5 ? 'failed' : 'other'),
        errorCode: errorCode || undefined,
        errorDetail: content || undefined,
      }
    })
  )

  return {
    timestamp: now,
    currentTime: new Date().toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }),
    qps,
    rpm,
    tpm,
    last10sRequests: req10s,
    last1mRequests: req1m,
    last5mRequests: req5m,
    activeIps1m: ips1m,
    activeIps5m: ips5m,
    activeIps30m: ips30m,
    activeUsers1m: users1m,
    avgLatency1m,
    successRate1m,
    recentLogs,
  }
}
