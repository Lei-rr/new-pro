// ─── 领域类型：与后端 DTO 严格对齐 ───

export interface OverviewSummary {
  totalRequests: number;
  billingRequests: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalQuota: number;
  totalCost: number;
  errorCount: number;
  errorLogCount: number;
  errorRate: number;
  cacheHitRate: number;
  streamRatio: number;
  clientGoneCount: number;
  activeModels: number;
  activeChannels: number;
  activeUsers: number;
  activeTokens: number;
  activeIps: number;
  activeGroups: number;
  avgResponseTime: number;
  avgFrt: number;
  cacheHitTokens: number;
  firstEntry: number | null;
  lastEntry: number | null;
  uptimeSeconds: number;
}

export interface TimelineBucket {
  time: string;
  requests: number;
  promptTokens: number;
  completionTokens: number;
  quota: number;
  errors: number;
  models: number;
  users: number;
}

export type DimensionType = 'channel' | 'model' | 'token' | 'user' | 'group';
export type DimensionSort = 'requests' | 'tokens' | 'quota' | 'errors' | 'cost' | 'frt';

export interface DimensionStats {
  key: string;
  requests: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  quota: number;
  cost: number;
  errors: number;
  avgResponseTime: number;
  avgFrt: number;
  cacheTokens: number;
  firstSeen: number;
  lastSeen: number;
}

export interface DimensionResponse {
  dimension: string;
  total: number;
  offset: number;
  limit: number;
  count: number;
  data: DimensionStats[];
}

export interface CostTrendPoint {
  date: string;
  quota: number;
  cost: number;
  requests: number;
}

export interface CostSummary {
  totalQuota: number;
  totalCost: number;
  totalRequests: number;
  billingRequests: number;
  avgCostPerRequest: number;
  pluginDetails: Record<string, unknown>;
}

export type AlertSeverity = 'info' | 'warning' | 'critical';

export interface Alert {
  id: string;
  ruleId: string;
  severity: AlertSeverity;
  message: string;
  timestamp: number;
  details?: Record<string, unknown>;
}

export interface AlertsResponse {
  count: number;
  alerts: Alert[];
  summaries: Record<string, Record<string, unknown>>;
}

export interface HealthInfo {
  status: string;
  uptime: number;
  entries: number;
  consume: number;
  memory: number;
  timestamp: number;
}

// ─── 聚合端点（前端每页一次请求） ───

export interface DashboardResponse {
  hours: number;
  start: number;
  end: number;
  summary: OverviewSummary;
  prevSummary: OverviewSummary;
  timeline: TimelineBucket[];
  topModels: DimensionStats[];
  topChannels: DimensionStats[];
  topUsers: DimensionStats[];
  channelHealth: Array<{ key: string; requests: number; errors: number; errorRate: number }>;
  alerts: Alert[];
}

export interface CostAnalyticsResponse {
  totalQuota: number;
  totalCost: number;
  billingRequests: number;
  avgCostPerRequest: number;
  todayCost: number;
  todayRequests: number;
  trend: CostTrendPoint[];
  tokenTop: DimensionStats[];
  modelTop: DimensionStats[];
}

// ─── 原始日志流 ───

export type RawLogKind = 'all' | 'consume' | 'error' | 'sys' | 'success' | 'failure';

export interface RawLogEntry {
  id: string;
  timestamp: number;
  type: number;
  typeLabel: string;
  kind: 'consume' | 'error' | 'sys' | 'info';
  success: boolean;
  model: string | null;
  channelId: number | null;
  channelName: string | null;
  quota: number;
  promptTokens: number;
  completionTokens: number;
  isStream: boolean;
  ip: string | null;
  requestId: string;
  username: string | null;
  tokenName: string | null;
  group: string | null;
  message: string;
}

export interface RawLogResponse {
  total: number;
  count: number;
  offset: number;
  limit: number;
  data: RawLogEntry[];
}

// ─── WS 消息 ───

export interface WsSnapshot {
  type: 'snapshot';
  data: {
    summary: OverviewSummary;
    plugins: Record<string, Record<string, unknown>>;
    alerts: Alert[];
  };
}

export interface WsStatsUpdate {
  type: 'stats_update';
  data: {
    summary: OverviewSummary;
    alerts: Alert[];
  };
}

export interface WsNewLogs {
  type: 'new_logs';
  data: RawLogEntry[];
}

export interface WsAlert {
  type: 'alert';
  data: Alert;
}

export type WsMessage = WsSnapshot | WsStatsUpdate | WsNewLogs | WsAlert;
