import { getDb } from '../db.js'
import { parseTimeRange, type TimeRangeKey } from './time-ranges.js'
import { memoryCache } from './cache.js'

export type RiskSeverity = 'critical' | 'high' | 'medium' | 'low'

export interface RiskAlert {
  id: string
  title: string
  description: string
  severity: RiskSeverity
  category: 'ip_abuse' | 'channel_failure' | 'cost_anomaly' | 'token_leak' | 'latency_spike'
  target: string
  metricValue: string
  threshold: string
  suggestion: string
  details?: Record<string, any>
  createdAt: string
}

export interface HighRiskIpItem {
  ip: string
  requestCount: number
  failedCount: number
  failureRate: number
  quotaUsed: number
  costUsd?: number
  modelsUsed: string[]
  tokensUsed?: string[]
  lastSeen: string
  riskType: 'relay_hijack' | 'brushing' | 'massive_volume'
  riskReason: string
  rpmRate?: number
  burst5m?: number
  burst1m?: number
  severity: RiskSeverity
}

export interface RiskReport {
  timeRange: {
    key: string
    label: string
  }
  summary: {
    criticalCount: number
    highCount: number
    mediumCount: number
    lowCount: number
    abnormalIpCount: number
    unhealthyChannelCount: number
    totalAlerts: number
    systemHealthScore: number // 0 - 100
  }
  alerts: RiskAlert[]
  highRiskIps: HighRiskIpItem[]
  failingChannels: Array<{
    id: number
    name: string
    failedRequests: number
    totalRequests: number
    errorRate: number
    avgLatency: number
    lastErrorMessage: string
  }>
}

// 常见本机/网关回环与内部 IP（避免把自身反代或内网转发误报为攻击）
const INTERNAL_HOST_IPS = new Set(['127.0.0.1', '::1', 'localhost', '52.221.92.226', '未知'])

export function isInternalIp(ip: string): boolean {
  if (!ip || INTERNAL_HOST_IPS.has(ip)) return true
  if (ip.startsWith('172.19.') || ip.startsWith('172.20.') || ip.startsWith('172.21.')) return true
  return false
}

export async function detectSystemRisks(rangeKey: TimeRangeKey = '24h'): Promise<RiskReport> {
  const cacheKey = `risks:${rangeKey}`
  const cached = memoryCache.get<RiskReport>(cacheKey)
  if (cached) return cached

  const db = getDb()
  const filter = parseTimeRange(rangeKey)
  const timeCondition = filter.startTime > 0 ? `WHERE created_at >= ${filter.startTime} AND created_at <= ${filter.endTime}` : ''
  const andTimeCondition = filter.startTime > 0 ? `AND created_at >= ${filter.startTime} AND created_at <= ${filter.endTime}` : ''

  const alerts: RiskAlert[] = []

  const nowTs = Math.floor(Date.now() / 1000)
  const fiveMinAgo = nowTs - 300
  const oneMinAgo = nowTs - 60

  // 1. 扫描 IP 总体调用情况（频次、失败率、消耗）
  const ipScanSql = `
    SELECT 
      COALESCE(NULLIF(ip, ''), '未知') as ip_addr,
      count(*) as total_req,
      count(*) FILTER (WHERE type = 5) as failed_req,
      COALESCE(sum(quota) FILTER (WHERE type = 2), 0) as quota_used,
      array_agg(DISTINCT model_name) FILTER (WHERE model_name IS NOT NULL AND model_name != '') as models,
      array_agg(DISTINCT token_name) FILTER (WHERE token_name IS NOT NULL AND token_name != '') as tokens,
      to_char(timezone('Asia/Shanghai', to_timestamp(max(created_at))), 'YYYY-MM-DD HH24:MI:SS') as last_seen,
      max(created_at) as last_seen_ts
    FROM logs
    ${timeCondition}
    GROUP BY ip_addr
    HAVING count(*) >= 20
    ORDER BY total_req DESC
    LIMIT 50
  `

  // 2. 短时间内（最近 5 分钟 / 1 分钟）突发并发与短时高频探测
  const burstScanSql = `
    SELECT 
      COALESCE(NULLIF(ip, ''), '未知') as ip_addr,
      count(*) as burst_5m,
      count(*) FILTER (WHERE created_at >= ${oneMinAgo}) as burst_1m,
      count(*) FILTER (WHERE type = 5) as failed_5m,
      array_agg(DISTINCT model_name) FILTER (WHERE model_name IS NOT NULL AND model_name != '') as burst_models,
      array_agg(DISTINCT token_name) FILTER (WHERE token_name IS NOT NULL AND token_name != '') as burst_tokens
    FROM logs
    WHERE created_at >= ${fiveMinAgo}
    GROUP BY ip_addr
    HAVING count(*) >= 20
    ORDER BY burst_5m DESC
    LIMIT 25
  `

  // 3. 扫描严重故障或完全瘫痪的主力渠道（面向公益站：放宽偶发错误阈值，只抓真正大面积瘫痪）
  const channelScanSql = `
    SELECT 
      l.channel_id,
      COALESCE(c.name, '渠道 #' || l.channel_id::text) as channel_name,
      c.status as current_status,
      count(*) as total_req,
      count(*) FILTER (WHERE l.type = 5) as failed_req,
      COALESCE(round(avg(l.use_time) FILTER (WHERE l.use_time > 0)), 0) as avg_latency,
      (SELECT content FROM logs WHERE channel_id = l.channel_id AND type = 5 ORDER BY id DESC LIMIT 1) as last_err
    FROM logs l
    LEFT JOIN channels c ON l.channel_id = c.id
    WHERE l.channel_id IS NOT NULL ${andTimeCondition}
    GROUP BY l.channel_id, c.name, c.status
    HAVING count(*) >= 30
    ORDER BY failed_req DESC
    LIMIT 20
  `

  // 4. 扫描全局极端严重超时 (>45秒，排除常规思考模型长耗时)
  const failureSpikeSql = `
    SELECT 
      count(*) as total_req,
      count(*) FILTER (WHERE type = 5) as total_failed,
      count(*) FILTER (WHERE use_time > 45000) as extreme_slow
    FROM logs
    ${timeCondition}
  `

  const [ipRes, burstRes, channelRes, spikeRes] = await Promise.all([
    db.query(ipScanSql),
    db.query(burstScanSql),
    db.query(channelScanSql),
    db.query(failureSpikeSql),
  ])

  // 分析渠道健康度与风险（面向公益站：放宽偶发错误容忍度，只抓真正大面积瘫痪或死掉的渠道）
  const failingChannels: RiskReport['failingChannels'] = []
  for (const row of channelRes.rows) {
    const total = Number(row.total_req || 0)
    const failed = Number(row.failed_req || 0)
    const errorRate = total > 0 ? Number(((failed / total) * 100).toFixed(1)) : 0
    const avgLatency = Number(row.avg_latency || 0)
    const channelName = String(row.channel_name)
    const channelId = Number(row.channel_id)

    // 公益站判定严重瘫痪的标准：
    // 1. 累计请求 >= 30 次且错误率 >= 50%
    // 2. 或累计请求 >= 15 次且 100% 彻底瘫痪
    // 3. 或平均延迟极高 (>15000ms) 且失败率 >= 30%
    const isSevereOutage = (total >= 30 && errorRate >= 50) || (total >= 15 && errorRate === 100) || (avgLatency >= 15000 && errorRate >= 30)

    if (isSevereOutage) {
      failingChannels.push({
        id: channelId,
        name: channelName,
        failedRequests: failed,
        totalRequests: total,
        errorRate,
        avgLatency,
        lastErrorMessage: row.last_err || '无详细错误记录',
      })

      const severity: RiskSeverity = errorRate >= 80 ? 'critical' : 'high'
      alerts.push({
        id: `alert-channel-${channelId}`,
        title: `主力渠道「${channelName}」严重故障 (失败率 ${errorRate}%)`,
        description: `在所选时间范围内共请求 ${total} 次，失败 ${failed} 次，平均延迟 ${avgLatency}ms。最新报错：${row.last_err || 'Upstream Error'}`,
        severity,
        category: 'channel_failure',
        target: channelName,
        metricValue: `${errorRate}% 失败率`,
        threshold: '公益站健康容忍线 < 50%',
        suggestion: '建议在 NewAPI 管理后台暂时禁用此渠道或下调权重，切流至其他可用渠道，防止公共用户大面积报错。',
        details: { channelId, total, failed, errorRate, avgLatency },
        createdAt: new Date().toISOString(),
      })
    }
  }

  // 分析高危与恶意刷量 IP（聚焦中转站接走、极端天量请求、恶意死循环三大核心）
  const highRiskIps: HighRiskIpItem[] = []
  const recordedIps = new Set<string>()

  // 1. 优先分析短时间突发高频与恶意轰炸 (最近 5 分钟 / 1 分钟突刺)
  const burstMap = new Map<string, any>()
  for (const b of burstRes.rows) {
    burstMap.set(String(b.ip_addr), b)
  }

  // 遍历突发统计
  for (const b of burstRes.rows) {
    const ip = String(b.ip_addr)
    // 排除内网与本机回环 IP
    if (isInternalIp(ip)) continue

    const burst5m = Number(b.burst_5m || 0)
    const burst1m = Number(b.burst_1m || 0)
    const failed5m = Number(b.failed_5m || 0)
    const failRate5m = burst5m > 0 ? (failed5m / burst5m) * 100 : 0
    const models = (b.burst_models || []).slice(0, 5)
    const tokens = (b.burst_tokens || []).slice(0, 5)

    // 核心规则 1: 被别家中转站接走 / 持续高频并发 (1分钟 >= 60次，或5分钟 >= 200次)
    const isRelayHijack = burst1m >= 60 || burst5m >= 200
    // 核心规则 2: 短时恶意死循环撞库 (5分钟 >= 30次且失败率 >= 70%，或1分钟 >= 20次且失败率 >= 75%)
    const isBrushingBurst = (burst5m >= 30 && failRate5m >= 70) || (burst1m >= 20 && failRate5m >= 75)

    if (isRelayHijack || isBrushingBurst) {
      recordedIps.add(ip)
      const riskType: HighRiskIpItem['riskType'] = isBrushingBurst ? 'brushing' : 'relay_hijack'
      const severity: RiskSeverity = (burst1m >= 90 || failRate5m >= 85) ? 'critical' : 'high'

      const reason = isBrushingBurst
        ? `【恶意死循环刷接口】5分钟内持续报错请求 ${burst5m} 次 (失败率高达 ${failRate5m.toFixed(1)}%)，客户端持续报错却不停止重试！`
        : `【疑似被中转站接走 / 持续高频】每分钟请求高达 ${burst1m} 次 (5分钟累计 ${burst5m} 次)，疑似被其他中转站套娃对接或自动化爬虫持续占用！`

      highRiskIps.push({
        ip,
        requestCount: burst5m,
        failedCount: failed5m,
        failureRate: Number(failRate5m.toFixed(1)),
        quotaUsed: 0,
        modelsUsed: models,
        tokensUsed: tokens,
        lastSeen: '刚刚 (5分钟内)',
        riskType,
        riskReason: reason,
        rpmRate: burst1m * 60,
        burst5m,
        burst1m,
        severity,
      })

      alerts.push({
        id: `alert-burst-ip-${ip.replace(/[.:]/g, '-')}`,
        title: isBrushingBurst ? `检测到恶意死循环刷量 IP: ${ip}` : `检测到疑似中转站套娃 IP: ${ip}`,
        description: `${reason} 涉及模型: ${models.join(', ') || '通用'}，使用令牌: ${tokens.join(', ') || '默认'}。`,
        severity,
        category: 'ip_abuse',
        target: ip,
        metricValue: `1分钟 ${burst1m} 次 / 5分钟 ${burst5m} 次`,
        threshold: '安全并发线: 1分钟 < 60 次',
        suggestion: isBrushingBurst
          ? '建议立即在防火墙、Nginx 或 NewAPI 客户端黑名单中彻底封禁该 IP。'
          : '该 IP 呈现典型的中转站转发或多线程持续抓取特征，建议予以限频或单 IP 并发限制。',
        details: { ip, burst5m, burst1m, failed5m, failRate5m },
        createdAt: new Date().toISOString(),
      })
    }
  }

  // 2. 分析全周期宏观数据（天量调用、持续恶意刷接口）
  for (const row of ipRes.rows) {
    const ip = String(row.ip_addr)
    if (isInternalIp(ip)) continue

    const total = Number(row.total_req || 0)
    const failed = Number(row.failed_req || 0)
    const failureRate = total > 0 ? Number(((failed / total) * 100).toFixed(1)) : 0
    const quota = Number(row.quota_used || 0)
    const models = (row.models || []).slice(0, 5)
    const tokens = (row.tokens || []).slice(0, 5)
    const b = burstMap.get(ip)
    const burst5m = b ? Number(b.burst_5m || 0) : 0
    const burst1m = b ? Number(b.burst_1m || 0) : 0

    let isRisky = false
    let riskReason = ''
    let riskType: HighRiskIpItem['riskType'] = 'massive_volume'
    let severity: RiskSeverity = 'high'

    // 核心规则 3: 一直恶意死循环刷接口 (累计 >= 200 次且失败率 >= 70%，或累计失败 >= 150 次且失败率 >= 60%)
    // 核心规则 4: 单 IP 极端天量请求 (累计 >= 5000 次，干了几千上万次请求)
    if ((total >= 200 && failureRate >= 70) || (failed >= 150 && failureRate >= 60)) {
      isRisky = true
      riskType = 'brushing'
      severity = failureRate >= 85 ? 'critical' : 'high'
      riskReason = `【持续恶意刷接口】累计请求高达 ${total.toLocaleString()} 次，失败率高达 ${failureRate}% (失败 ${failed} 次)，无视报错持续死循环刷接口！`
    } else if (total >= 5000) {
      isRisky = true
      riskType = 'massive_volume'
      severity = total >= 10000 ? 'critical' : 'high'
      riskReason = `【单IP极端天量请求】单 IP 在统计周期内累计发起 ${total.toLocaleString()} 次请求，吞吐量过大占用大量调度资源！`
    }

    if (isRisky) {
      if (recordedIps.has(ip)) {
        // 更新已有记录的全局调用量与配额
        const existing = highRiskIps.find((h) => h.ip === ip)
        if (existing) {
          existing.requestCount = total
          existing.failedCount = failed
          existing.failureRate = failureRate
          existing.quotaUsed = quota
        }
      } else {
        recordedIps.add(ip)
        highRiskIps.push({
          ip,
          requestCount: total,
          failedCount: failed,
          failureRate,
          quotaUsed: quota,
          modelsUsed: models,
          tokensUsed: tokens,
          lastSeen: row.last_seen,
          riskType,
          riskReason,
          burst5m,
          burst1m,
          severity,
        })

        alerts.push({
          id: `alert-ip-${ip.replace(/[.:]/g, '-')}`,
          title: riskType === 'brushing' ? `发现持续恶意刷接口 IP: ${ip}` : `发现单 IP 天量调用: ${ip}`,
          description: `${riskReason} 涉及模型: ${models.join(', ') || '默认'}，使用令牌: ${tokens.join(', ') || '默认'}。`,
          severity,
          category: 'ip_abuse',
          target: ip,
          metricValue: `${total} 请求 / ${failureRate}% 失败`,
          threshold: riskType === 'brushing' ? '失败率警戒线 < 50%' : '单IP请求上限 < 5,000 次',
          suggestion: riskType === 'brushing'
            ? '该 IP 表现出明显的破坏性死循环探测或恶意刷量特征，建议立即在防火墙彻底拉黑。'
            : '单 IP 请求次数过多，建议配置单 IP 每日请求次数上限或予以限速。',
          details: { ip, total, failed, failureRate, quota, models, tokens },
          createdAt: new Date().toISOString(),
        })
      }
    }
  }

  // 4. 极端响应超时告警 (>45秒，排除常规思考模型长耗时)
  const spikeRow = spikeRes.rows[0] || {}
  const extremeSlow = Number(spikeRow.extreme_slow || 0)
  if (extremeSlow > 50) {
    alerts.push({
      id: 'alert-extreme-slow',
      title: `检测到 ${extremeSlow} 次严重超时请求 (>45秒)`,
      description: `系统监测到周期内有大量上游渠道响应极度缓慢或阻塞，可能引发客户端连接池耗尽。`,
      severity: 'medium',
      category: 'latency_spike',
      target: '系统网关与上游链路',
      metricValue: `${extremeSlow} 次超长超时`,
      threshold: '健康阈值 < 50 次',
      suggestion: '建议为上游渠道配置适度的超时中断 (如 60s)，并开启备用渠道流转以保障公共用户体验。',
      createdAt: new Date().toISOString(),
    })
  }

  // 按危险级别与请求量综合排序
  const severityWeight = { critical: 4, high: 3, medium: 2, low: 1 }
  highRiskIps.sort((a, b) => {
    const diff = (severityWeight[b.severity] || 0) - (severityWeight[a.severity] || 0)
    if (diff !== 0) return diff
    return (b.burst1m || 0) * 10 + b.requestCount - ((a.burst1m || 0) * 10 + a.requestCount)
  })

  // 计算系统健康度评分（100分满分）
  let healthScore = 100
  for (const a of alerts) {
    if (a.severity === 'critical') healthScore -= 18
    else if (a.severity === 'high') healthScore -= 10
    else if (a.severity === 'medium') healthScore -= 5
    else healthScore -= 2
  }
  if (healthScore < 20) healthScore = 20

  const criticalCount = alerts.filter((a) => a.severity === 'critical').length
  const highCount = alerts.filter((a) => a.severity === 'high').length
  const mediumCount = alerts.filter((a) => a.severity === 'medium').length
  const lowCount = alerts.filter((a) => a.severity === 'low').length

  const result: RiskReport = {
    timeRange: {
      key: filter.key,
      label: filter.label,
    },
    summary: {
      criticalCount,
      highCount,
      mediumCount,
      lowCount,
      abnormalIpCount: highRiskIps.length,
      unhealthyChannelCount: failingChannels.length,
      totalAlerts: alerts.length,
      systemHealthScore: Math.max(0, healthScore),
    },
    alerts,
    highRiskIps,
    failingChannels,
  }

  // 写入缓存 5 秒
  memoryCache.set(cacheKey, result, 5000)

  return result

  // 写入缓存 5 秒
  memoryCache.set(cacheKey, result, 5000)

  return result
}
