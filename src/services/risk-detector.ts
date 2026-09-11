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
  modelsUsed: string[]
  tokensUsed?: string[]
  lastSeen: string
  riskType: 'brushing' | 'high_failure' | 'burst' | 'massive_volume'
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
  costSurgeUsers: Array<{
    username: string
    quota: number
    costUsd: number
    requestCount: number
    avgCostPerReq: number
    abnormalFactor: string
  }>
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

  // 1. 扫描当前时间范围内的 IP 总体统计（频次、失败率、配额）
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
    HAVING count(*) >= 15
    ORDER BY total_req DESC
    LIMIT 40
  `

  // 2. 短时间内（最近 5 分钟 / 1 分钟）突发暴增高频与恶意轰炸 IP 检测
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
    HAVING count(*) >= 30
    ORDER BY burst_5m DESC
    LIMIT 20
  `

  // 3. 扫描报错率过高或异常宕机的渠道
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
    HAVING count(*) >= 10
    ORDER BY failed_req DESC
    LIMIT 20
  `

  // 4. 扫描单用户突发超高消耗
  const userCostSql = `
    SELECT 
      COALESCE(NULLIF(username, ''), '未知') as uname,
      count(*) as req_count,
      COALESCE(sum(quota), 0) as total_quota
    FROM logs
    WHERE type = 2 ${andTimeCondition}
    GROUP BY uname
    ORDER BY total_quota DESC
    LIMIT 15
  `

  // 5. 扫描全局失败突刺
  const failureSpikeSql = `
    SELECT 
      count(*) as total_req,
      count(*) FILTER (WHERE type = 5) as total_failed,
      count(*) FILTER (WHERE use_time > 15000) as extreme_slow
    FROM logs
    ${timeCondition}
  `

  const [ipRes, burstRes, channelRes, userRes, spikeRes] = await Promise.all([
    db.query(ipScanSql),
    db.query(burstScanSql),
    db.query(channelScanSql),
    db.query(userCostSql),
    db.query(failureSpikeSql),
  ])

  // 分析渠道健康度与风险
  const failingChannels: RiskReport['failingChannels'] = []
  for (const row of channelRes.rows) {
    const total = Number(row.total_req || 0)
    const failed = Number(row.failed_req || 0)
    const errorRate = total > 0 ? Number(((failed / total) * 100).toFixed(1)) : 0
    const avgLatency = Number(row.avg_latency || 0)
    const channelName = String(row.channel_name)
    const channelId = Number(row.channel_id)

    if (errorRate >= 20 || avgLatency >= 10000 || (row.current_status === 2 && failed > 0)) {
      failingChannels.push({
        id: channelId,
        name: channelName,
        failedRequests: failed,
        totalRequests: total,
        errorRate,
        avgLatency,
        lastErrorMessage: row.last_err || '无详细错误记录',
      })

      const severity: RiskSeverity = errorRate >= 50 ? 'critical' : errorRate >= 25 ? 'high' : 'medium'
      alerts.push({
        id: `alert-channel-${channelId}`,
        title: `渠道「${channelName}」错误率异常高达 ${errorRate}%`,
        description: `在所选时间范围内共请求 ${total} 次，失败 ${failed} 次，平均延迟 ${avgLatency}ms。最新报错信息：${row.last_err || 'Upstream Error'}`,
        severity,
        category: 'channel_failure',
        target: channelName,
        metricValue: `${errorRate}% 失败率`,
        threshold: '健康阈值 < 10%',
        suggestion: errorRate >= 50 
          ? '建议立即在 NewAPI 管理后台暂时禁用此渠道或下调权重，避免拖慢客户端并发。'
          : '建议检查上游账户余额、Token额度及网络代理状态。',
        details: { channelId, total, failed, errorRate, avgLatency },
        createdAt: new Date().toISOString(),
      })
    }
  }

  // 分析高危与恶意刷量 IP
  const highRiskIps: HighRiskIpItem[] = []
  const recordedIps = new Set<string>()

  // 1. 优先分析短时间突发高频 (最近 5 分钟 / 1 分钟突刺)
  const burstMap = new Map<string, any>()
  for (const b of burstRes.rows) {
    burstMap.set(String(b.ip_addr), b)
  }

  // 遍历突发统计
  for (const b of burstRes.rows) {
    const ip = String(b.ip_addr)
    const burst5m = Number(b.burst_5m || 0)
    const burst1m = Number(b.burst_1m || 0)
    const failed5m = Number(b.failed_5m || 0)
    const failRate5m = burst5m > 0 ? (failed5m / burst5m) * 100 : 0
    const models = (b.burst_models || []).slice(0, 5)
    const tokens = (b.burst_tokens || []).slice(0, 5)

    // 规则 A: 短时间极端高频突刺 (1分钟 >= 60次，或5分钟 >= 200次)
    // 规则 B: 短时间明显恶意刷接口 (5分钟 >= 40次且失败率 >= 70%)
    const isExtremeBurst = burst1m >= 60 || burst5m >= 200
    const isMaliciousBrushing = (burst5m >= 40 && failRate5m >= 70) || (burst1m >= 25 && failRate5m >= 80)

    if (isExtremeBurst || isMaliciousBrushing) {
      recordedIps.add(ip)
      const riskType = isMaliciousBrushing ? 'brushing' : 'burst'
      const severity: RiskSeverity = (burst1m >= 80 || failRate5m >= 85) ? 'critical' : 'high'

      const reason = isMaliciousBrushing
        ? `【恶意高频刷量/爆破】短时间内突发恶意调用 (1m: ${burst1m}次, 5m: ${burst5m}次)，且失败率高达 ${failRate5m.toFixed(1)}%！`
        : `【超高频突发洪峰】单 IP 调用频率过快 (1分钟内高达 ${burst1m} 次, 5分钟累计 ${burst5m} 次)，可能打满并发连接。`

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
        title: isMaliciousBrushing ? `检测到恶意高频刷量 IP: ${ip}` : `检测到超高频突发 IP: ${ip}`,
        description: `${reason} 涉及模型: ${models.join(', ') || '通用'}，使用令牌: ${tokens.join(', ') || '默认'}。`,
        severity,
        category: 'ip_abuse',
        target: ip,
        metricValue: `1分钟 ${burst1m} 次 / 5分钟 ${burst5m} 次`,
        threshold: '安全频率阈值: 1分钟 < 60 次',
        suggestion: isMaliciousBrushing
          ? '检测到极高可能性的恶意脚本轮询或撞库，建议立即在防火墙、Nginx 反代或 NewAPI 令牌/IP 黑名单中彻底封禁。'
          : '请核实该客户端是否为正常高并发爬虫或授权业务，必要时配置并发上限限流。',
        details: { ip, burst5m, burst1m, failed5m, failRate5m },
        createdAt: new Date().toISOString(),
      })
    }
  }

  // 2. 分析全周期宏观恶意高频与高失败 IP
  for (const row of ipRes.rows) {
    const ip = String(row.ip_addr)
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
    let severity: RiskSeverity = 'medium'

    // 规则 C: 持续明显恶意刷接口 (累计 >= 500 次且失败率 >= 75%)
    // 规则 D: 持续极度高频调用 (单 IP 累计超过 25000 次)
    if (total >= 500 && failureRate >= 75) {
      isRisky = true
      riskType = 'brushing'
      severity = failureRate >= 90 ? 'critical' : 'high'
      riskReason = `【持续恶意刷接口】累计请求高达 ${total.toLocaleString()} 次，且失败率高达 ${failureRate}%，明显为脚本死循环试探或恶意撞库！`
    } else if (total > 25000) {
      isRisky = true
      riskType = 'massive_volume'
      severity = total > 50000 ? 'high' : 'medium'
      riskReason = `【持续超大调用量】单 IP 累计调用高达 ${total.toLocaleString()} 次，持续高频占用上游调度队列`
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
          title: riskType === 'brushing' ? `发现高危恶意刷接口 IP: ${ip}` : `发现异常高频调用 IP: ${ip}`,
          description: `${riskReason}。累计请求 ${total} 次，消耗配额 ${quota}，主要调用模型: ${models.join(', ') || '默认'}。`,
          severity,
          category: 'ip_abuse',
          target: ip,
          metricValue: `${total} 请求 / ${failureRate}% 失败`,
          threshold: riskType === 'brushing' ? '失败率警戒线 < 30%' : '安全频率 < 5000 次',
          suggestion: riskType === 'brushing'
            ? '该 IP 表现出明显的攻击性自动化探测或恶意占道特征，建议立即拉黑屏蔽。'
            : '建议在防火墙、Nginx 反向代理层或 NewAPI 客户端黑名单中限制其访问速率。',
          details: { ip, total, failed, failureRate, quota, models, tokens },
          createdAt: new Date().toISOString(),
        })
      }
    }
  }

  // 按危险级别与请求量综合排序
  const severityWeight = { critical: 4, high: 3, medium: 2, low: 1 }
  highRiskIps.sort((a, b) => {
    const diff = (severityWeight[b.severity] || 0) - (severityWeight[a.severity] || 0)
    if (diff !== 0) return diff
    return (b.burst1m || 0) * 10 + b.requestCount - ((a.burst1m || 0) * 10 + a.requestCount)
  })

  // 分析用户突增消耗
  const costSurgeUsers: RiskReport['costSurgeUsers'] = []
  for (const row of userRes.rows) {
    const reqCount = Number(row.req_count || 0)
    const totalQuota = Number(row.total_quota || 0)
    const costUsd = Number((totalQuota / 500000).toFixed(4))
    const avgCost = reqCount > 0 ? Number((costUsd / reqCount).toFixed(4)) : 0
    const uname = String(row.uname)

    if (costUsd > 10 || totalQuota > 5000000) {
      costSurgeUsers.push({
        username: uname,
        quota: totalQuota,
        costUsd,
        requestCount: reqCount,
        avgCostPerReq: avgCost,
        abnormalFactor: `已消耗 $${costUsd} (${totalQuota.toLocaleString()} Quota)`,
      })

      if (costUsd > 20) {
        alerts.push({
          id: `alert-user-${uname}`,
          title: `用户「${uname}」配额消耗激增告警`,
          description: `该用户在周期内累计消耗 $${costUsd} USD (${totalQuota.toLocaleString()} Quota)，单次请求均费 $${avgCost}。`,
          severity: costUsd > 50 ? 'critical' : 'medium',
          category: 'cost_anomaly',
          target: uname,
          metricValue: `$${costUsd} USD`,
          threshold: '预警线 > $10.00',
          suggestion: '请核验该用户是否为其业务正常消耗，或核实是否存在 API Key 泄露被第三方盗刷风险。',
          details: { username: uname, costUsd, totalQuota, reqCount },
          createdAt: new Date().toISOString(),
        })
      }
    }
  }

  // 极慢请求告警
  const spikeRow = spikeRes.rows[0] || {}
  const extremeSlow = Number(spikeRow.extreme_slow || 0)
  if (extremeSlow > 50) {
    alerts.push({
      id: 'alert-extreme-slow',
      title: `检测到 ${extremeSlow} 次请求超长耗时 (>15秒)`,
      description: `系统监测到周期内有大量上游模型响应超时或阻塞，可能引发客户端连接池耗尽或队列积压。`,
      severity: 'medium',
      category: 'latency_spike',
      target: '系统网关与上游链路',
      metricValue: `${extremeSlow} 次长耗时`,
      threshold: '健康阈值 < 20 次',
      suggestion: '建议为上游渠道配置适度的超时中断 (如 30s)，并开启备用渠道流转以保障前端体验。',
      createdAt: new Date().toISOString(),
    })
  }

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
    costSurgeUsers,
  }

  // 写入缓存 5 秒
  memoryCache.set(cacheKey, result, 5000)

  return result
}
