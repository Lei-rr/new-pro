export type TimeRangeKey = 'today' | '1h' | '6h' | '24h' | '3d' | '7d' | '30d' | 'all'

export type DimensionType = 'group' | 'user' | 'channel' | 'ip' | 'model'

export interface TimeRangeInfo {
  key: TimeRangeKey
  label: string
  startTime: number
  endTime: number
}

export interface TrendItem {
  timePoint: string
  total: number
  success: number
  failed: number
  quota: number
  tokens: number
  avgLatency: number
}

export interface OverviewMetrics {
  timeRange: TimeRangeInfo
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
  trend: TrendItem[]
  topChannels: Array<{ id: number; name: string; count: number; failed: number; avgLatency: number }>
  modelConsumptionDistribution: {
    timePoints: string[]
    models: string[]
    series: Array<{ modelName: string; quotaData: number[]; tokensData: number[] }>
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
    fastCount: number
    normalCount: number
    slowCount: number
    timeoutCount: number
    fastPct: number
    normalPct: number
    slowPct: number
    timeoutPct: number
  }
  knownIpList: string[]
  /**
   * knownIpList 是否因超出上限被截断。
   * 为 true 时集合不完整，前端不得据此推断「新 IP」，否则 activeIps 会重复计数。
   */
  knownIpListTruncated: boolean
}

export interface DimensionItem {
  id: string
  name: string
  location?: string
  totalRequests: number
  successRequests: number
  failedRequests: number
  successRate: number
  totalQuota: number
  costUsd: number
  promptTokens: number
  completionTokens: number
  totalTokens: number
  avgLatencyMs: number
  firstSeen: string
  lastSeen: string
}

export interface DimensionAnalysisResult {
  dimension: DimensionType
  timeRange: TimeRangeInfo
  totalEntities: number
  items: DimensionItem[]
}

export type RiskSeverity = 'critical' | 'high' | 'medium' | 'low'

export interface RiskAlert {
  id: string
  title: string
  description: string
  severity: RiskSeverity
  category: 'ip_abuse' | 'channel_failure' | 'latency_spike'
  target: string
  metricValue: string
  threshold: string
  suggestion: string
  createdAt: string
}

export type HighRiskIpType = 'relay_hijack' | 'brushing' | 'massive_volume'

export interface HighRiskIpItem {
  ip: string
  location?: string
  requestCount: number
  failedCount: number
  failureRate: number
  quotaUsed: number
  costUsd: number
  modelsUsed: string[]
  tokensUsed: string[]
  lastSeen: string
  riskType: HighRiskIpType
  riskReason: string
  rpmRate: number
  burst5m: number
  burst1m: number
  severity: RiskSeverity
}

export interface RiskReport {
  timeRange: { key: string; label: string }
  summary: {
    criticalCount: number
    highCount: number
    mediumCount: number
    lowCount: number
    abnormalIpCount: number
    unhealthyChannelCount: number
    totalAlerts: number
    systemHealthScore: number
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

export type RealtimeLogStatus = 'success' | 'failed' | 'other'

export interface RealtimeLog {
  id: number
  createdAt: string
  type: number
  model: string
  channelName: string
  /** 调用所使用的令牌名称 */
  tokenName: string
  username: string
  ip: string
  ipLocation?: string
  /** 是否为流式（SSE）请求 */
  isStream: boolean
  quota: number
  promptTokens: number
  completionTokens: number
  totalTokens: number
  useTime: number
  /** 首字延迟（毫秒）；仅流式请求且上游返回该指标时存在 */
  firstTokenMs?: number
  /** 命中缓存的输入 token 数（prompt 的子集）；无缓存时为 0 */
  cacheTokens: number
  status: RealtimeLogStatus
  errorCode?: string
  errorDetail?: string
}

export interface RealtimePulse {
  timestamp: number
  /** 成功请求速率（与 NewAPI 口径一致） */
  qps: number
  rpm: number
  tpm: number
  activeIps5m: number
  activeIps30m: number
  avgLatency1m: number
  /** 成功率基于成功 + 失败两类终态请求计算 */
  successRate1m: number
  recentLogs: RealtimeLog[]
}

export interface SessionInfo {
  authenticated: boolean
  username: string | null
  dbConnected: boolean
  version: string
  pulseIntervalSec: number
  calibrationIntervalSec: number
}

export interface LoginResult {
  username: string
  version: string
  dbConnected: boolean
}
