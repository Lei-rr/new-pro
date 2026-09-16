import { query } from '../db.js'
import { parseTimeRange } from './time-ranges.js'
import { memoryCache } from './cache.js'
import { getIpLocation } from './geoip.js'
import { quotaToUsd, calcRate } from './calc.js'
import type {
  RiskReport,
  RiskAlert,
  HighRiskIpItem,
  RiskSeverity,
  TimeRangeKey,
  FailingChannelItem,
} from '../types/index.js'

export type { RiskReport, RiskAlert, HighRiskIpItem, RiskSeverity }

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

  const filter = parseTimeRange(rangeKey)
  const params: unknown[] = []
  let timeCondition = ''
  let andTimeCondition = ''

  if (filter.startTime > 0) {
    params.push(filter.startTime, filter.endTime)
    timeCondition = 'WHERE created_at >= $1 AND created_at <= $2'
    andTimeCondition = 'AND created_at >= $1 AND created_at <= $2'
  }

  const alerts: RiskAlert[] = []
  const nowTs = Math.floor(Date.now() / 1000)
  const fiveMinAgo = nowTs - 300
  const oneMinAgo = nowTs - 60

  // 1. 扫描 IP 总体调用情况 (频次、失败率、消耗)
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

  // 2. 短时间内突发高频探测 (最近 5 分钟 / 1 分钟)
  const burstScanSql = `
    SELECT 
      COALESCE(NULLIF(ip, ''), '未知') as ip_addr,
      count(*) as burst_5m,
      count(*) FILTER (WHERE created_at >= $1) as burst_1m,
      count(*) FILTER (WHERE type = 5) as failed_5m,
      array_agg(DISTINCT model_name) FILTER (WHERE model_name IS NOT NULL AND model_name != '') as burst_models,
      array_agg(DISTINCT token_name) FILTER (WHERE token_name IS NOT NULL AND token_name != '') as burst_tokens
    FROM logs
    WHERE created_at >= $2
    GROUP BY ip_addr
    HAVING count(*) >= 20
    ORDER BY burst_5m DESC
    LIMIT 25
  `

  // 3. 扫描故障渠道
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

  // 4. 扫描全局极端严重超时 (>45秒)
  const failureSpikeSql = `
    SELECT 
      count(*) as total_req,
      count(*) FILTER (WHERE type = 5) as total_failed,
      count(*) FILTER (WHERE use_time > 45000) as extreme_slow
    FROM logs
    ${timeCondition}
  `

  const [ipRes, burstRes, channelRes, spikeRes] = await Promise.all([
    query(ipScanSql, params),
    query(burstScanSql, [oneMinAgo, fiveMinAgo]),
    query(channelScanSql, params),
    query(failureSpikeSql, params),
  ])

  // 分析渠道健康度与风险
  const failingChannels: FailingChannelItem[] = []
  for (const row of channelRes.rows) {
    const total = Number(row.total_req || 0)
    const failed = Number(row.failed_req || 0)
    const errorRate = calcRate(failed, total, 1)
    const avgLatency = Number(row.avg_latency || 0)
    const channelName = String(row.channel_name)
    const channelId = Number(row.channel_id)

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
        threshold: '健康容忍线 < 50%',
        suggestion: '建议在管理后台暂时禁用此渠道或下调权重，切流至其他可用渠道。',
        details: { channelId, total, failed, errorRate, avgLatency },
        createdAt: new Date().toISOString(),
      })
    }
  }

  // 分析高危与恶意刷量 IP
  const highRiskIps: HighRiskIpItem[] = []
  const recordedIps = new Set<string>()

  // 1. 优先分析短时间突发高频与恶意轰炸
  const burstMap = new Map<string, any>()
  for (const b of burstRes.rows) {
    burstMap.set(String(b.ip_addr), b)
  }

  for (const b of burstRes.rows) {
    const ip = String(b.ip_addr)
    if (isInternalIp(ip)) continue

    const burst5m = Number(b.burst_5m || 0)
    const burst1m = Number(b.burst_1m || 0)
    const failed5m = Number(b.failed_5m || 0)
    const failRate5m = calcRate(failed5m, burst5m, 1)
    const models = (b.burst_models || []).slice(0, 5)
    const tokens = (b.burst_tokens || []).slice(0, 5)

    const isRelayHijack = burst1m >= 60 || burst5m >= 200
    const isBrushingBurst = (burst5m >= 30 && failRate5m >= 70) || (burst1m >= 20 && failRate5m >= 75)

    if (isRelayHijack || isBrushingBurst) {
      recordedIps.add(ip)
      const riskType: HighRiskIpItem['riskType'] = isBrushingBurst ? 'brushing' : 'relay_hijack'
      const severity: RiskSeverity = (burst1m >= 90 || failRate5m >= 85) ? 'critical' : 'high'

      const reason = isBrushingBurst
        ? `【恶意死循环刷接口】5分钟内持续报错请求 ${burst5m} 次 (失败率高达 ${failRate5m.toFixed(1)}%)，客户端持续报错却未停止重试！`
        : `【疑似被中转站接走 / 持续高频】每分钟请求高达 ${burst1m} 次 (5分钟累计 ${burst5m} 次)，疑似被其他系统套娃对接或自动化爬虫占用！`

      highRiskIps.push({
        ip,
        location: await getIpLocation(ip),
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
        title: isBrushingBurst ? `检测到恶意死循环刷量 IP: ${ip}` : `检测到疑似高频中转 IP: ${ip}`,
        description: `${reason} 涉及模型: ${models.join(', ') || '通用'}，使用令牌: ${tokens.join(', ') || '默认'}。`,
        severity,
        category: 'ip_abuse',
        target: ip,
        metricValue: `1分钟 ${burst1m} 次 / 5分钟 ${burst5m} 次`,
        threshold: '安全并发线: 1分钟 < 60 次',
        suggestion: isBrushingBurst
          ? '建议立即在防火墙、Nginx 或客户端黑名单中封禁该 IP。'
          : '该 IP 呈现典型的中转站转发或多线程抓取特征，建议予以限频或单 IP 并发限制。',
        details: { ip, burst5m, burst1m, failed5m, failRate5m },
        createdAt: new Date().toISOString(),
      })
    }
  }

  // 2. 分析全周期宏观数据
  for (const row of ipRes.rows) {
    const ip = String(row.ip_addr)
    if (isInternalIp(ip)) continue

    const total = Number(row.total_req || 0)
    const failed = Number(row.failed_req || 0)
    const quota = Number(row.quota_used || 0)
    const failureRate = calcRate(failed, total, 1)
    const models = (row.models || []).slice(0, 5)
    const tokens = (row.tokens || []).slice(0, 5)
    const b = burstMap.get(ip)
    const burst5m = b ? Number(b.burst_5m || 0) : 0
    const burst1m = b ? Number(b.burst_1m || 0) : 0

    let isRisky = false
    let riskReason = ''
    let riskType: HighRiskIpItem['riskType'] = 'massive_volume'
    let severity: RiskSeverity = 'high'

    if ((total >= 200 && failureRate >= 70) || (failed >= 150 && failureRate >= 60)) {
      isRisky = true
      riskType = 'brushing'
      severity = failureRate >= 85 ? 'critical' : 'high'
      riskReason = `【持续恶意刷接口】累计请求高达 ${total.toLocaleString()} 次，失败率高达 ${failureRate}% (失败 ${failed} 次)！`
    } else if (total >= 5000) {
      isRisky = true
      riskType = 'massive_volume'
      severity = total >= 10000 ? 'critical' : 'high'
      riskReason = `【单IP极端天量请求】单 IP 在统计周期内累计发起 ${total.toLocaleString()} 次请求，吞吐量过大占用调度资源！`
    }

    if (isRisky) {
      if (recordedIps.has(ip)) {
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
          location: await getIpLocation(ip),
          requestCount: total,
          failedCount: failed,
          failureRate,
          quotaUsed: quota,
          costUsd: quotaToUsd(quota),
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
            ? '该 IP 表现出明显的破坏性死循环探测或恶意刷量特征，建议在防火墙拉黑。'
            : '单 IP 请求次数过多，建议配置单 IP 每日请求次数上限或予以限速。',
          details: { ip, total, failed, failureRate, quota, models, tokens },
          createdAt: new Date().toISOString(),
        })
      }
    }
  }

  // 3. 极端响应超时告警 (>45秒)
  const spikeRow = spikeRes.rows[0] || {}
  const extremeSlow = Number(spikeRow.extreme_slow || 0)
  if (extremeSlow > 50) {
    alerts.push({
      id: 'alert-extreme-slow',
      title: `检测到 ${extremeSlow} 次严重超时请求 (>45秒)`,
      description: `系统监测到周期内有大量上游渠道响应极度缓慢或阻塞。`,
      severity: 'medium',
      category: 'latency_spike',
      target: '系统网关与上游链路',
      metricValue: `${extremeSlow} 次超长超时`,
      threshold: '健康阈值 < 50 次',
      suggestion: '建议为上游渠道配置适度的超时中断 (如 60s)，并开启备用渠道流转。',
      createdAt: new Date().toISOString(),
    })
  }

  // 排序
  const severityWeight: Record<RiskSeverity, number> = { critical: 4, high: 3, medium: 2, low: 1 }
  highRiskIps.sort((a, b) => {
    const diff = (severityWeight[b.severity] || 0) - (severityWeight[a.severity] || 0)
    if (diff !== 0) return diff
    return (b.burst1m || 0) * 10 + b.requestCount - ((a.burst1m || 0) * 10 + a.requestCount)
  })

  // 计算健康评分
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

  memoryCache.set(cacheKey, result, 5000)
  return result
}
