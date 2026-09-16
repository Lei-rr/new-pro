export type TimeRangeKey = 'today' | '1h' | '6h' | '24h' | '3d' | '7d' | '30d' | 'all'

export interface TimeRangeFilter {
  key: TimeRangeKey
  startTime: number
  endTime: number
  label: string
}

export type DimensionType = 'group' | 'user' | 'channel' | 'ip' | 'model'

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
  firstSeen?: string
  lastSeen?: string
}

export interface DimensionAnalysisResult {
  dimension: DimensionType
  timeRange: {
    key: string
    label: string
    startTime: number
    endTime: number
  }
  totalEntities: number
  items: DimensionItem[]
}

export interface DimensionFilterOptions {
  model?: string
  channelId?: number
  username?: string
  group?: string
}

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
  details?: Record<string, unknown>
  createdAt: string
}

export interface HighRiskIpItem {
  ip: string
  location?: string
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

export interface FailingChannelItem {
  id: number
  name: string
  failedRequests: number
  totalRequests: number
  errorRate: number
  avgLatency: number
  lastErrorMessage: string
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
    systemHealthScore: number
  }
  alerts: RiskAlert[]
  highRiskIps: HighRiskIpItem[]
  failingChannels: FailingChannelItem[]
}

export interface RealtimePulseLog {
  id: number
  createdAt: string
  type: number
  model: string
  channelName: string
  username: string
  ip: string
  ipLocation?: string
  quota: number
  promptTokens: number
  completionTokens: number
  totalTokens: number
  useTime: number
  status: 'success' | 'failed' | 'other'
  errorCode?: string
  errorDetail?: string
}

export interface RealtimePulse {
  timestamp: number
  currentTime: string
  qps: number
  rpm: number
  tpm: number
  last10sRequests: number
  last1mRequests: number
  last5mRequests: number
  activeIps1m: number
  activeIps5m: number
  activeIps30m: number
  activeUsers1m: number
  avgLatency1m: number
  successRate1m: number
  recentLogs: RealtimePulseLog[]
}

export interface ChannelStatusItem {
  id: number
  name: string
  type: number
  status: number
  priority: number
  weight: number
  responseTime: number
  testTime: number
}

export interface OverviewMetrics {
  timeRange: TimeRangeFilter
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
    channels: ChannelStatusItem[]
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
    location?: string
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
    fastCount: number
    normalCount: number
    slowCount: number
    timeoutCount: number
    fastPct: number
    normalPct: number
    slowPct: number
    timeoutPct: number
  }
  knownIpList?: string[]
}

export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
  message?: string
}
