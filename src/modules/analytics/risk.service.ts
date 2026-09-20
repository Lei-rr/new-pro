import { query } from '../../core/db.js'
import { MemoryCache, cached, registerCache } from '../../core/cache.js'
import { getConfig } from '../../config.js'
import type { RiskRules } from '../../config.js'
import { parseTimeRange, type TimeRangeKey } from '../../core/time-range.js'
import { quotaToUsd, calcRate, round, toNumber } from '../../shared/calc.js'
import { isInternalSource } from '../../shared/ip.js'
import { resolveIpLocations } from '../../services/geoip.js'
import { buildRiskQueries, type RiskQuery } from './risk-queries.js'
import {
  SEVERITY_PENALTY,
  SEVERITY_WEIGHT,
  evaluateChannelRule,
  evaluateExtremeSlowRule,
  evaluateIpRule,
  type ChannelSignals,
  type IpSignals,
  type RuleFinding,
} from './risk-rules.js'
import type { FailingChannelItem, HighRiskIpItem, RiskAlert, RiskReport } from './types.js'

const CACHE = registerCache('risk', new MemoryCache(64))
const MIN_HEALTH_SCORE = 20
const TOP_LIST_LIMIT = 5

interface ResultRow {
  [column: string]: unknown
}

function toStringArray(value: unknown, limit: number): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string').slice(0, limit)
    : []
}

function alertId(ruleId: string, target: string): string {
  return `${ruleId}-${target.replace(/[.:]/g, '-')}`
}

/** 将规则命中结果转换为告警条目 */
function toAlert(finding: RuleFinding, target: string, createdAt: string): RiskAlert {
  return {
    id: alertId(finding.ruleId, target),
    title: finding.title,
    description: finding.description,
    severity: finding.severity,
    category: finding.category,
    target,
    metricValue: finding.metricValue,
    threshold: finding.threshold,
    suggestion: finding.suggestion,
    createdAt,
  }
}

function buildChannelSignals(row: ResultRow): ChannelSignals {
  const total = toNumber(row.total_req)
  const failed = toNumber(row.failed_req)
  return {
    id: toNumber(row.channel_id),
    name: String(row.channel_name),
    total,
    failed,
    errorRate: calcRate(failed, total, 1),
    avgLatency: toNumber(row.avg_latency),
    lastErrorMessage: String(row.last_err || '无详细错误记录'),
  }
}

function buildBurstIndex(rows: ResultRow[]): Map<string, ResultRow> {
  return new Map(rows.map((row) => [String(row.ip_addr), row]))
}

/** 组装 IP 的规则输入：合并突发窗口与统计周期两组信号 */
function buildIpSignals(row: ResultRow, burstRow: ResultRow | undefined, ip: string): IpSignals {
  const windowTotal = toNumber(row.total_req)
  const windowFailed = toNumber(row.failed_req)
  const burst5m = toNumber(burstRow?.burst_5m)
  const burst1m = toNumber(burstRow?.burst_1m)
  const burstFailed = toNumber(burstRow?.failed_5m)

  return {
    ip,
    burst1m,
    burst5m,
    burstFailed,
    burstFailureRate: calcRate(burstFailed, burst5m, 1),
    windowTotal,
    windowFailed,
    windowFailureRate: calcRate(windowFailed, windowTotal, 1),
    windowQuota: toNumber(row.quota_used),
    models: toStringArray(burstRow?.burst_models ?? row.models, TOP_LIST_LIMIT),
    tokens: toStringArray(burstRow?.burst_tokens ?? row.tokens, TOP_LIST_LIMIT),
    lastSeen: String(row.last_seen || '刚刚 (5分钟内)'),
  }
}

function toRiskItem(finding: RuleFinding, signal: IpSignals): HighRiskIpItem {
  // 命中突发规则时展示突发窗口数据，命中周期规则时展示周期累计数据
  const isBurst = finding.basis === 'burst'
  const requestCount = isBurst ? signal.burst5m : signal.windowTotal
  const failedCount = isBurst ? signal.burstFailed : signal.windowFailed
  const quotaUsed = isBurst ? 0 : signal.windowQuota

  return {
    ip: signal.ip,
    requestCount,
    failedCount,
    failureRate: isBurst ? signal.burstFailureRate : signal.windowFailureRate,
    quotaUsed,
    costUsd: quotaToUsd(quotaUsed),
    modelsUsed: signal.models,
    tokensUsed: signal.tokens,
    lastSeen: signal.lastSeen,
    riskType: finding.riskType ?? 'massive_volume',
    riskReason: `${finding.description}。触发规则：${finding.threshold}`,
    rpmRate: signal.burst1m * 60,
    burst5m: signal.burst5m,
    burst1m: signal.burst1m,
    severity: finding.severity,
  }
}

/** 渠道：按优先级取首个命中规则，保证描述与实际原因一致 */
function evaluateChannels(rows: ResultRow[], rules: RiskRules, createdAt: string) {
  const failingChannels: FailingChannelItem[] = []
  const alerts: RiskAlert[] = []

  for (const row of rows) {
    const signal = buildChannelSignals(row)
    const finding = evaluateChannelRule(signal, rules)
    if (!finding) continue

    failingChannels.push({
      id: signal.id,
      name: signal.name,
      failedRequests: signal.failed,
      totalRequests: signal.total,
      errorRate: signal.errorRate,
      avgLatency: signal.avgLatency,
      lastErrorMessage: signal.lastErrorMessage,
    })
    alerts.push(toAlert(finding, signal.name, createdAt))
  }

  return { failingChannels, alerts }
}

/**
 * IP 评估。
 * 两个扫描各自带 LIMIT，取并集可避免「高突发但周期总量未进前 50」的 IP 被漏掉；
 * 同一 IP 在并集中只评估一次，信号以周期扫描为主、突发扫描补充。
 */
function evaluateIps(
  scanRows: ResultRow[],
  burstRows: ResultRow[],
  rules: RiskRules,
  createdAt: string
) {
  const items: HighRiskIpItem[] = []
  const alerts: RiskAlert[] = []
  const burstIndex = buildBurstIndex(burstRows)

  const scanIndex = new Map(scanRows.map((row) => [String(row.ip_addr), row]))
  const candidateIps = new Set([...scanIndex.keys(), ...burstIndex.keys()])

  for (const ip of candidateIps) {
    if (isInternalSource(ip)) continue

    const scanRow = scanIndex.get(ip)
    const burstRow = burstIndex.get(ip)
    if (!scanRow && !burstRow) continue

    // 仅在突发扫描中出现时，用突发数据补齐周期字段，保证规则可完整评估
    const baseRow: ResultRow = scanRow ?? {
      total_req: 0,
      failed_req: toNumber(burstRow?.failed_5m),
      quota_used: 0,
      models: burstRow?.burst_models,
      tokens: burstRow?.burst_tokens,
      last_seen: '刚刚 (5分钟内)',
    }

    const signal = buildIpSignals(baseRow, burstRow, ip)
    const finding = evaluateIpRule(signal, rules)
    if (!finding) continue

    items.push(toRiskItem(finding, signal))
    alerts.push(toAlert(finding, ip, createdAt))
  }

  return { items, alerts }
}

function countSeverity(
  alerts: RiskAlert[]
): Pick<RiskReport['summary'], 'criticalCount' | 'highCount' | 'mediumCount' | 'lowCount'> {
  const summary = { criticalCount: 0, highCount: 0, mediumCount: 0, lowCount: 0 }
  for (const alert of alerts) {
    if (alert.severity === 'critical') summary.criticalCount += 1
    else if (alert.severity === 'high') summary.highCount += 1
    else if (alert.severity === 'medium') summary.mediumCount += 1
    else summary.lowCount += 1
  }
  return summary
}

function sortRiskItems(items: HighRiskIpItem[]): HighRiskIpItem[] {
  return items.sort((a, b) => {
    const bySeverity = SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity]
    if (bySeverity !== 0) return bySeverity
    return b.burst1m * 10 + b.requestCount - (a.burst1m * 10 + a.requestCount)
  })
}

async function loadRiskReport(rangeKey: TimeRangeKey): Promise<RiskReport> {
  const range = parseTimeRange(rangeKey)
  const rules = getConfig().risk
  const queries = buildRiskQueries({ range, rules, nowSec: Math.floor(Date.now() / 1000) })

  const run = (def: RiskQuery) => query<ResultRow>(def.sql, def.params)
  const [ipRes, burstRes, channelRes, extremeSlowRes] = await Promise.all([
    run(queries.ipScan),
    run(queries.burstScan),
    run(queries.channelScan),
    run(queries.extremeSlow),
  ])

  const createdAt = new Date().toISOString()
  const channelResult = evaluateChannels(channelRes.rows, rules, createdAt)
  const ipResult = evaluateIps(ipRes.rows, burstRes.rows, rules, createdAt)

  const alerts = [...channelResult.alerts, ...ipResult.alerts]
  const slowFinding = evaluateExtremeSlowRule(toNumber(extremeSlowRes.rows[0]?.extreme_slow), rules)
  if (slowFinding) alerts.push(toAlert(slowFinding, '系统网关与上游链路', createdAt))

  const highRiskIps = sortRiskItems(ipResult.items)
  const locations = await resolveIpLocations(highRiskIps.map((item) => item.ip))
  for (const item of highRiskIps) {
    item.location = locations.get(item.ip)
  }

  let healthScore = 100
  for (const alert of alerts) healthScore -= SEVERITY_PENALTY[alert.severity]

  return {
    timeRange: { key: range.key, label: range.label },
    summary: {
      ...countSeverity(alerts),
      abnormalIpCount: highRiskIps.length,
      unhealthyChannelCount: channelResult.failingChannels.length,
      totalAlerts: alerts.length,
      systemHealthScore: round(Math.max(MIN_HEALTH_SCORE, healthScore), 0),
    },
    alerts,
    highRiskIps,
    failingChannels: channelResult.failingChannels,
  }
}

export function detectSystemRisks(rangeKey: TimeRangeKey = '24h'): Promise<RiskReport> {
  return cached(CACHE, `risks:${rangeKey}`, getConfig().riskCacheTtlMs, () => loadRiskReport(rangeKey))
}

/** 暴露规则清单，供诊断接口说明告警判定依据 */
export { RULE_CATALOG } from './risk-rules.js'
