import { getDb } from '../db.js'
import { parseTimeRange, type TimeRangeKey } from './time-ranges.js'
import { memoryCache } from './cache.js'

export interface OverviewMetrics {
  timeRange: {
    key: string
    label: string
    startTime: number
    endTime: number
  }
  summary: {
    totalRequests: number
    successRequests: number
    failedRequests: number
    successRate: number
    totalQuota: number
    totalCostUsd: number
    avgLatencyMs: number
    promptTokens: number
    completionTokens: number
    totalTokens: number
    maxLogId: number
    activeIps: number
    avgReqPerIp: number
    avgCostPerIp: number
  }
  channelsStatus: {
    total: number
    active: number
    disabled: number
    channels: Array<{
      id: number
      name: string
      type: number
      status: number
      priority: number
      weight: number
      responseTime: number
      testTime: number
    }>
  }
  trend: Array<{
    timePoint: string
    total: number
    success: number
    failed: number
    quota: number
    tokens: number
    avgLatency: number
  }>
  topModels: Array<{
    name: string
    count: number
    quota: number
    tokens: number
  }>
  topUsers: Array<{
    name: string
    count: number
    quota: number
  }>
  topChannels: Array<{
    id: number
    name: string
    count: number
    failed: number
    avgLatency: number
  }>
  topIps: Array<{
    ip: string
    count: number
    tokens: number
    quota: number
    costUsd: number
    failed: number
  }>
  dbStats: {
    totalLogsInDb: number
    activeChannelsCount: number
    totalUsersCount: number
  }
  modelConsumptionDistribution: {
    timePoints: string[]
    models: string[]
    series: Array<{
      modelName: string
      quotaData: number[]
      tokensData: number[]
    }>
  }
  performanceHealth: {
    systemSuccessRate: number
    avgLatencyMs: number
    tpsTokensPerSec: number
    topModelsHealth: Array<{
      modelName: string
      successRate: number
      count: number
      avgLatency: number
    }>
  }
  streamEfficiency: {
    streamCount: number
    nonStreamCount: number
    streamPercentage: number
    streamAvgLatency: number
    nonStreamAvgLatency: number
    streamTokens: number
    nonStreamTokens: number
  }
  latencyBuckets: {
    fastCount: number      // <500ms
    normalCount: number    // 500ms-1.5s
    slowCount: number      // 1.5s-3s
    timeoutCount: number   // >3s
    fastPct: number
    normalPct: number
    slowPct: number
    timeoutPct: number
  }
}

export async function getDashboardOverview(rangeKey: TimeRangeKey = 'today'): Promise<OverviewMetrics> {
  const cacheKey = `overview:${rangeKey}`
  const cached = memoryCache.get<OverviewMetrics>(cacheKey)
  if (cached) return cached

  const db = getDb()
  const filter = parseTimeRange(rangeKey)

  const timeCondition = filter.startTime > 0 ? `WHERE created_at >= ${filter.startTime} AND created_at <= ${filter.endTime}` : ''
  const andTimeCondition = filter.startTime > 0 ? `AND created_at >= ${filter.startTime} AND created_at <= ${filter.endTime}` : ''

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
  // 当时间跨度 >= 7 天时：启用 NewAPI 官方 quota_data 预聚合表加速长期趋势，并将最近未入表的 logs 补齐
  const isLongTerm = ['7d', '30d', 'all'].includes(rangeKey)
  let trendFormat = isLongTerm || rangeKey === '3d' ? 'YYYY-MM-DD' : 'YYYY-MM-DD HH24:00'

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
        ${filter.startTime > 0 ? `WHERE created_at >= ${filter.startTime} AND created_at <= ${filter.endTime}` : ''}
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

  // 6. TOP 8 渠道调用
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

  // 7. 数据库基础总量 (利用 max(id) 秒级获取日志总数，避免 150ms 的全表扫描)
  const dbStatsSql = `
    SELECT 
      (SELECT count(*) FROM channels) as channels_count,
      (SELECT count(*) FROM users) as users_count,
      (SELECT COALESCE(max(id), 0) FROM logs) as logs_count
  `

  // 8. 官方同款：TOP 5 核心模型消耗分布矩阵 (按时间分段统计)
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

  // 9. 官方同款：头部模型健康率 (Performance Health)
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

  // 10. 流式吞吐对比 (Stream vs Non-stream)
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

  // 11. 延迟阶梯分级 (<500ms, 500ms-1.5s, 1.5s-3s, >3s)
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

  // 12. IP 排行榜 (请求次数 & Token 消耗前 10)
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

  // 13. 周期活跃 IP 终端规模统计
  const activeScaleSql = `
    SELECT 
      count(DISTINCT NULLIF(ip, '')) as active_ips
    FROM logs
    ${timeCondition}
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
  ] = await Promise.all([
    db.query(summarySql),
    db.query(channelsSql),
    db.query(trendSql),
    db.query(topModelsSql),
    db.query(topUsersSql),
    db.query(topChannelsSql),
    db.query(dbStatsSql),
    db.query(modelDistSql),
    db.query(modelHealthSql),
    db.query(streamSql),
    db.query(latencyBucketsSql),
    db.query(topIpsSql),
    db.query(activeScaleSql),
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
  const successRate = totalRequests > 0 ? Number(((successRequests / totalRequests) * 100).toFixed(2)) : 100
  // NewAPI quota: 500000 quota = $1 USD
  const totalCostUsd = Number((totalQuota / 500000).toFixed(4))

  const allChannels = channelsRes.rows.map((r: any) => ({
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

  return {
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
          successRate: tot > 0 ? Number(((succ / tot) * 100).toFixed(1)) : 100,
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
        streamPercentage: total > 0 ? Number(((streamCount / total) * 100).toFixed(1)) : 0,
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
        fastPct: total > 0 ? Number(((fastCount / total) * 100).toFixed(1)) : 100,
        normalPct: total > 0 ? Number(((normalCount / total) * 100).toFixed(1)) : 0,
        slowPct: total > 0 ? Number(((slowCount / total) * 100).toFixed(1)) : 0,
        timeoutPct: total > 0 ? Number(((timeoutCount / total) * 100).toFixed(1)) : 0,
      }
    })(),
    topIps: topIpsRes.rows.map((r: any) => {
      const q = Number(r.quota || 0)
      return {
        ip: String(r.ip),
        count: Number(r.count || 0),
        tokens: Number(r.tokens || 0),
        quota: q,
        costUsd: Number((q / 500000).toFixed(4)),
        failed: Number(r.failed || 0),
      }
    }),
  }

  // 写入缓存 4 秒 (足够平滑前端切换且避免瞬间高频击穿)
  memoryCache.set(cacheKey, result, 4000)

  return result
}
