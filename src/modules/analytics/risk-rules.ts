import type { RiskRules } from '../../config.js'
import type { HighRiskIpType, RiskCategory, RiskSeverity } from './types.js'

/**
 * 风控告警规则目录。
 * 每条规则自带「判定 + 文案」，保证告警展示的阈值与实际触发条件始终一致。
 * 同一实体命中多条规则时按 priority 取最高优先级一条，从结构上消除重复告警。
 */

export interface IpSignals {
  ip: string
  /** 实时突发窗口（最近 5 分钟 / 1 分钟） */
  burst1m: number
  burst5m: number
  burstFailed: number
  burstFailureRate: number
  /** 统计周期窗口 */
  windowTotal: number
  windowFailed: number
  windowFailureRate: number
  windowQuota: number
  models: string[]
  tokens: string[]
  lastSeen: string
}

export interface ChannelSignals {
  id: number
  name: string
  total: number
  failed: number
  errorRate: number
  avgLatency: number
  lastErrorMessage: string
}

/** 规则匹配结果：判定与运维文案同时产出，避免两处维护导致口径漂移 */
export interface RuleFinding {
  ruleId: string
  category: RiskCategory
  severity: RiskSeverity
  /** 命中规则对应的风险类型；渠道与超时规则为空 */
  riskType: HighRiskIpType | null
  /** 指标取值来源：突发窗口 or 统计周期，决定高危列表展示哪组数字 */
  basis: 'burst' | 'window'
  title: string
  description: string
  metricValue: string
  threshold: string
  suggestion: string
}

interface IpRule {
  id: string
  priority: number
  riskType: HighRiskIpType
  detect: (signal: IpSignals, rules: RiskRules) => RuleFinding | null
}

interface ChannelRule {
  id: string
  priority: number
  detect: (signal: ChannelSignals, rules: RiskRules) => RuleFinding | null
}

const IP_CATEGORY: RiskCategory = 'ip_abuse'
const CHANNEL_CATEGORY: RiskCategory = 'channel_failure'

function describeList(values: string[], fallback: string): string {
  return values.length > 0 ? values.join(', ') : fallback
}

/**
 * 突发类告警的统一升级条件：分钟级请求极多，或失败率极高。
 * 两条路径任一成立即升级为 critical。
 */
function burstSeverity(burst1m: number, failureRate: number, rules: RiskRules): RiskSeverity {
  const hitRequestBurst = burst1m >= rules.relayCriticalPerMinute
  const hitFailureBurst = failureRate >= rules.ipCriticalFailRate
  return hitRequestBurst || hitFailureBurst ? 'critical' : 'high'
}

/** 优先级：周期刷接口 > 突发刷量 > 中转套娃 > 天量调用 */
const IP_RULES: IpRule[] = [
  {
    id: 'ip-brute-force',
    priority: 50,
    riskType: 'brushing',
    detect: ({ ip, windowTotal, windowFailed, windowFailureRate, models, tokens }, rules) => {
      const hitVolume = windowTotal >= rules.bruteForceTotal && windowFailureRate >= rules.bruteForceFailRate
      const hitFailedFloor =
        windowFailed >= rules.bruteForceFailedFloor && windowFailureRate >= rules.bruteForceFailRateLow
      if (!hitVolume && !hitFailedFloor) return null

      const threshold = hitVolume
        ? `触发线：请求 ≥ ${rules.bruteForceTotal.toLocaleString()} 次 且 失败率 ≥ ${rules.bruteForceFailRate}%`
        : `触发线：失败次数 ≥ ${rules.bruteForceFailedFloor.toLocaleString()} 次 且 失败率 ≥ ${rules.bruteForceFailRateLow}%`

      return {
        ruleId: 'ip-brute-force',
        category: IP_CATEGORY,
        severity: windowFailureRate >= rules.ipCriticalFailRate ? 'critical' : 'high',
        riskType: 'brushing',
        basis: 'window',
        title: `发现持续恶意刷接口 IP: ${ip}`,
        description: `【持续恶意刷接口】统计周期内累计请求 ${windowTotal.toLocaleString()} 次，失败 ${windowFailed.toLocaleString()} 次（失败率 ${windowFailureRate}%），表现为无休止重试。涉及模型: ${describeList(models, '默认')}；使用令牌: ${describeList(tokens, '默认')}`,
        metricValue: `${windowTotal.toLocaleString()} 请求 / ${windowFailureRate}% 失败`,
        threshold,
        suggestion: '该 IP 表现出破坏性死循环探测或恶意刷量特征，建议在防火墙直接拉黑。',
      }
    },
  },
  {
    id: 'ip-brushing-burst',
    priority: 40,
    riskType: 'brushing',
    detect: ({ ip, burst1m, burst5m, burstFailureRate, models, tokens }, rules) => {
      const hitFiveMinute =
        burst5m >= rules.brushingBurst5m && burstFailureRate >= rules.brushingBurst5mFailRate
      const hitOneMinute =
        burst1m >= rules.brushingBurst1m && burstFailureRate >= rules.brushingBurst1mFailRate
      if (!hitFiveMinute && !hitOneMinute) return null

      const matchedWindow = hitFiveMinute
        ? `5 分钟内 ${burst5m} 次 / 失败率 ${burstFailureRate}%`
        : `1 分钟内 ${burst1m} 次 / 失败率 ${burstFailureRate}%`

      return {
        ruleId: 'ip-brushing-burst',
        category: IP_CATEGORY,
        severity: burstSeverity(burst1m, burstFailureRate, rules),
        riskType: 'brushing',
        basis: 'burst',
        title: `检测到恶意死循环刷量 IP: ${ip}`,
        description: `【恶意死循环刷接口】${matchedWindow}，客户端持续报错仍反复重试。涉及模型: ${describeList(models, '通用')}；使用令牌: ${describeList(tokens, '默认')}`,
        metricValue: `1分钟 ${burst1m} 次 / 5分钟 ${burst5m} 次 / 失败率 ${burstFailureRate}%`,
        threshold: `触发线：5 分钟 ≥ ${rules.brushingBurst5m} 次且失败率 ≥ ${rules.brushingBurst5mFailRate}%，或 1 分钟 ≥ ${rules.brushingBurst1m} 次且失败率 ≥ ${rules.brushingBurst1mFailRate}%`,
        suggestion: '建议立即在防火墙、Nginx 或客户端黑名单中封禁该 IP。',
      }
    },
  },
  {
    id: 'ip-relay-hijack',
    priority: 30,
    riskType: 'relay_hijack',
    detect: ({ ip, burst1m, burst5m, burstFailureRate }, rules) => {
      if (burst1m < rules.relayPerMinute && burst5m < rules.relayBurst5m) return null
      return {
        ruleId: 'ip-relay-hijack',
        category: IP_CATEGORY,
        severity: burstSeverity(burst1m, burstFailureRate, rules),
        riskType: 'relay_hijack',
        basis: 'burst',
        title: `检测到疑似高频中转 IP: ${ip}`,
        description: `【疑似被中转站接走/持续高频】每分钟请求达 ${burst1m} 次（5 分钟累计 ${burst5m} 次），疑似套娃转发或自动化爬虫占用`,
        metricValue: `1分钟 ${burst1m} 次 / 5分钟 ${burst5m} 次`,
        threshold: `触发线：1 分钟 ≥ ${rules.relayPerMinute} 次 或 5 分钟 ≥ ${rules.relayBurst5m} 次`,
        suggestion: '该 IP 呈现典型的中转转发或多线程抓取特征，建议限频或限制单 IP 并发。',
      }
    },
  },
  {
    id: 'ip-massive-volume',
    priority: 20,
    riskType: 'massive_volume',
    detect: ({ ip, windowTotal, windowFailureRate }, rules) => {
      if (windowTotal < rules.massiveVolume) return null
      const criticalLine = Math.round(rules.massiveVolume * rules.massiveVolumeCriticalFactor)
      return {
        ruleId: 'ip-massive-volume',
        category: IP_CATEGORY,
        severity: windowTotal >= criticalLine ? 'critical' : 'high',
        riskType: 'massive_volume',
        basis: 'window',
        title: `发现单 IP 天量调用: ${ip}`,
        description: `【单 IP 极端天量请求】统计周期内累计发起 ${windowTotal.toLocaleString()} 次请求，吞吐异常并占用调度资源`,
        metricValue: `${windowTotal.toLocaleString()} 请求 / ${windowFailureRate}% 失败`,
        threshold: `触发线：单 IP 请求 ≥ ${rules.massiveVolume.toLocaleString()} 次（严重线 ${criticalLine.toLocaleString()} 次）`,
        suggestion: '单 IP 请求次数过多，建议配置单 IP 每日请求上限或限制速率。',
      }
    },
  },
]

/** 渠道三类故障形态按优先级取首个命中，确保描述与实际原因一致 */
const CHANNEL_RULES: ChannelRule[] = [
  {
    id: 'channel-total-failure',
    priority: 30,
    detect: ({ name, total, failed, avgLatency, lastErrorMessage }, rules) => {
      const minRequests = Math.ceil(rules.channelMinRequests / 2)
      if (total < minRequests || failed !== total) return null
      return {
        ruleId: 'channel-total-failure',
        category: CHANNEL_CATEGORY,
        severity: 'critical',
        riskType: null,
        basis: 'window',
        title: `主力渠道「${name}」全部请求失败`,
        description: `所选时间范围内共请求 ${total} 次且全部失败，平均延迟 ${avgLatency}ms。最新报错：${lastErrorMessage}`,
        metricValue: `${total} 次请求全部失败`,
        threshold: `触发线：请求 ≥ ${minRequests} 次 且 失败率 100%`,
        suggestion: '建议在管理后台暂时禁用此渠道或下调权重，切流至其他可用渠道。',
      }
    },
  },
  {
    // 优先级高于高延迟规则：失败率已达标时不应被「高延迟」描述掩盖实际严重程度
    id: 'channel-severe-outage',
    priority: 20,
    detect: ({ name, total, failed, errorRate, avgLatency, lastErrorMessage }, rules) => {
      if (total < rules.channelMinRequests || errorRate < rules.channelFailRate) return null
      return {
        ruleId: 'channel-severe-outage',
        category: CHANNEL_CATEGORY,
        severity: errorRate >= rules.channelCriticalFailRate ? 'critical' : 'high',
        riskType: null,
        basis: 'window',
        title: `主力渠道「${name}」严重故障 (失败率 ${errorRate}%)`,
        description: `所选时间范围内共请求 ${total} 次，失败 ${failed} 次，平均延迟 ${avgLatency}ms。最新报错：${lastErrorMessage}`,
        metricValue: `${errorRate}% 失败率`,
        threshold: `触发线：请求 ≥ ${rules.channelMinRequests} 次 且 失败率 ≥ ${rules.channelFailRate}%`,
        suggestion: '建议在管理后台暂时禁用此渠道或下调权重，切流至其他可用渠道。',
      }
    },
  },
  {
    id: 'channel-high-latency',
    priority: 10,
    detect: ({ name, total, errorRate, avgLatency, lastErrorMessage }, rules) => {
      if (avgLatency < rules.channelHighLatencyMs || errorRate < rules.channelHighLatencyFailRate) {
        return null
      }
      return {
        ruleId: 'channel-high-latency',
        category: CHANNEL_CATEGORY,
        severity: 'high',
        riskType: null,
        basis: 'window',
        title: `主力渠道「${name}」高延迟且失败率异常`,
        description: `所选时间范围内共请求 ${total} 次，失败率 ${errorRate}%，平均延迟高达 ${avgLatency}ms。最新报错：${lastErrorMessage}`,
        metricValue: `平均延迟 ${avgLatency}ms / 失败率 ${errorRate}%`,
        threshold: `触发线：平均延迟 ≥ ${rules.channelHighLatencyMs}ms 且 失败率 ≥ ${rules.channelHighLatencyFailRate}%`,
        suggestion: '上游响应长期阻塞，建议检查渠道网络质量或降低其调度权重。',
      }
    },
  },
]

export function evaluateIpRule(signal: IpSignals, rules: RiskRules): RuleFinding | null {
  for (const rule of IP_RULES) {
    const finding = rule.detect(signal, rules)
    if (finding) return finding
  }
  return null
}

export function evaluateChannelRule(signal: ChannelSignals, rules: RiskRules): RuleFinding | null {
  for (const rule of CHANNEL_RULES) {
    const finding = rule.detect(signal, rules)
    if (finding) return finding
  }
  return null
}

export function evaluateExtremeSlowRule(count: number, rules: RiskRules): RuleFinding | null {
  if (count <= rules.extremeSlowAlertCount) return null
  const seconds = Math.round(rules.extremeSlowMs / 1000)
  return {
    ruleId: 'global-extreme-slow',
    category: 'latency_spike',
    severity: 'medium',
    riskType: null,
    basis: 'window',
    title: `检测到 ${count} 次严重超时请求 (>${seconds}秒)`,
    description: '系统监测到周期内有大量上游渠道响应极度缓慢或阻塞。',
    metricValue: `${count} 次超长超时`,
    threshold: `触发线：单次耗时 > ${seconds} 秒的请求超过 ${rules.extremeSlowAlertCount} 次`,
    suggestion: '建议为上游渠道配置适度的超时中断并开启备用渠道流转。',
  }
}

/** 高危 IP 排序权重 */
export const SEVERITY_WEIGHT: Record<RiskSeverity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
}

/** 健康评分扣分权重 */
export const SEVERITY_PENALTY: Record<RiskSeverity, number> = {
  critical: 18,
  high: 10,
  medium: 5,
  low: 2,
}

/** 规则清单，用于对外说明告警来源 */
export const RULE_CATALOG = {
  ip: IP_RULES.map((rule) => ({ id: rule.id, riskType: rule.riskType, priority: rule.priority })),
  channel: CHANNEL_RULES.map((rule) => ({ id: rule.id, priority: rule.priority })),
} as const
