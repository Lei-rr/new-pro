// ─── 领域类型：与后端 DTO（PG 数据源）严格对齐 ───

export interface OverviewSummary {
  billingRequests: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalQuota: number;
  totalCost: number;
  errorCount: number;
  errorRate: number;
  streamRatio: number;
  activeModels: number;
  activeChannels: number;
  activeUsers: number;
  activeTokens: number;
  activeGroups: number;
  avgUseTime: number;
  firstEntry: number | null;
  lastEntry: number | null;
}

export interface TimelineBucket {
  time: string;
  requests: number;
  promptTokens: number;
  completionTokens: number;
  quota: number;
}

export type DimensionType = 'channel' | 'model' | 'token' | 'user' | 'group';
export type DimensionSort = 'requests' | 'tokens' | 'quota' | 'cost';

export interface DimensionStats {
  key: string;
  requests: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  quota: number;
  cost: number;
  avgUseTime: number;
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
}

export interface HealthInfo {
  status: string;
  uptime: number;
  memory: number;
  timestamp: number;
}

// ─── 聚合端点（前端每页一次请求） ───

export interface DashboardResponse {
  days: number;
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
  trend: Array<{ date: string; quota: number; cost: number; requests: number }>;
  tokenTop: DimensionStats[];
  modelTop: DimensionStats[];
}

// ─── 原始日志流（PG logs 表） ───

export type RawLogKind = 'all' | 'consume' | 'error' | 'sys' | 'success' | 'failure';

export interface RawLogEntry {
  id: string;
  timestamp: number;
  type: number;
  typeLabel: string;
  kind: 'consume' | 'error' | 'sys';
  success: boolean;
  model: string | null;
  channelId: number | null;
  channelName: string | null;
  quota: number;
  promptTokens: number;
  completionTokens: number;
  isStream: boolean;
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

// ─── WS 消息（仅日志流推送） ───

export interface WsNewLogs {
  type: 'new_logs';
  data: RawLogEntry[];
}

export type WsMessage = WsNewLogs;
