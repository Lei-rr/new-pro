import { getDb } from '../db.js'

export interface RealtimePulse {
  timestamp: number
  currentTime: string
  qps: number          // 过去10秒平均每秒请求量 (Queries Per Second)
  rpm: number          // 当前估算每分钟请求量 (Requests Per Minute)
  tpm: number          // 当前估算每分钟Token吞吐量 (Tokens Per Minute)
  last10sRequests: number
  last1mRequests: number
  last5mRequests: number
  activeIps1m: number
  activeIps5m: number
  activeUsers1m: number
  avgLatency1m: number
  successRate1m: number
  recentLogs: Array<{
    id: number
    createdAt: string
    type: number
    model: string
    channelName: string
    username: string
    ip: string
    quota: number
    promptTokens: number
    completionTokens: number
    totalTokens: number
    useTime: number
    status: 'success' | 'failed' | 'other'
    errorCode?: string
    errorDetail?: string
  }>
}

export async function getRealtimePulse(): Promise<RealtimePulse> {
  const db = getDb()
  const now = Math.floor(Date.now() / 1000)
  const oneMinAgo = now - 60
  const tenSecAgo = now - 10
  const fiveMinAgo = now - 300

  // 1. 过去 1 分钟 / 10 秒吞吐量
  const throughputSql = `
    SELECT 
      count(*) FILTER (WHERE created_at >= ${tenSecAgo}) as req_10s,
      count(*) FILTER (WHERE created_at >= ${oneMinAgo}) as req_1m,
      count(*) FILTER (WHERE created_at >= ${fiveMinAgo}) as req_5m,
      count(*) FILTER (WHERE created_at >= ${oneMinAgo} AND type = 2) as success_1m,
      count(*) FILTER (WHERE created_at >= ${oneMinAgo} AND type = 5) as failed_1m,
      COALESCE(sum(prompt_tokens + completion_tokens) FILTER (WHERE created_at >= ${oneMinAgo} AND type = 2), 0) as tokens_1m,
      COALESCE(round(avg(use_time) FILTER (WHERE created_at >= ${oneMinAgo} AND use_time > 0)), 0) as avg_latency_1m,
      count(DISTINCT ip) FILTER (WHERE created_at >= ${oneMinAgo}) as ips_1m,
      count(DISTINCT ip) FILTER (WHERE created_at >= ${fiveMinAgo}) as ips_5m,
      count(DISTINCT username) FILTER (WHERE created_at >= ${oneMinAgo}) as users_1m
    FROM logs
    WHERE created_at >= ${fiveMinAgo}
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
    db.query(throughputSql),
    db.query(recentLogsSql),
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
  const users1m = Number(tp.users_1m || 0)

  const qps = Number((req10s / 10).toFixed(1))
  const rpm = req1m
  const tpm = tokens1m
  const successRate1m = req1m > 0 ? Number(((success1m / req1m) * 100).toFixed(1)) : 100

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
    activeUsers1m: users1m,
    avgLatency1m,
    successRate1m,
    recentLogs: logsRes.rows.map((r: any) => {
      const logType = Number(r.type)
      const content = String(r.content || '')
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

      return {
        id: Number(r.id),
        createdAt: new Date(Number(r.created_at) * 1000).toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }),
        type: logType,
        model: String(r.model),
        channelName: String(r.channel_name),
        username: String(r.username),
        ip: String(r.ip),
        quota: Number(r.quota || 0),
        promptTokens: Number(r.prompt_tokens || 0),
        completionTokens: Number(r.completion_tokens || 0),
        totalTokens: Number(r.total_tokens || 0),
        useTime: Number(r.use_time || 0),
        status: logType === 2 ? 'success' : (logType === 5 ? 'failed' : 'other'),
        errorCode: errorCode || undefined,
        errorDetail: content || undefined,
      }
    }),
  }
}
