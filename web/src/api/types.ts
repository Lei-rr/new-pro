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

export type DimensionType = 'channel' | 'model' | 'token' | 'user' | 'ip' | 'group';
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
  location?: string;
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

export interface LogEntry {
  timestamp: number;
  requestId: string;
  userId: number;
  ip: string | null;
  ipLocation: string | null;
  channelId: number;
  model: string;
  tokenName: string;
  tokenId: number;
  promptTokens: number;
  completionTokens: number;
  cacheTokens: number;
  quota: number;
  cost: number;
  useTime: number;
  frt: number | null;
  isStream: boolean;
  group: string;
  requestPath: string | null;
  billingSource: string | null;
  billingMode: string | null;
  streamStatus: string | null;
  modelRatio: number | null;
  modelPrice: number | null;
  completionRatio: number | null;
  groupRatio: number | null;
  userGroupRatio: number | null;
  cacheRatio: number | null;
  matchedTier: string | null;
  adminUseChannel: string[] | null;
}

export interface LogListResponse {
  total: number;
  count: number;
  offset: number;
  limit: number;
  data: LogEntry[];
}

export interface LogSearchFilter {
  q?: string;
  model?: string;
  user?: string;
  channel?: string;
  ip?: string;
  start?: number;
  end?: number;
  limit?: number;
  offset?: number;
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

export interface LogFacet {
  key: string;
  requests: number;
}

export interface LogFacetsResponse {
  models: LogFacet[];
  channels: LogFacet[];
  users: LogFacet[];
}

// ─── 原始日志流 ───

export type RawLogKind = 'all' | 'consume' | 'gin' | 'error' | 'success' | 'failure';

export interface RawLogEntry {
  timestamp: number;
  requestId: string | null;
  sourceFile: string;
  level: 'SYS' | 'GIN' | 'INFO' | 'ERR';
  kind: 'consume' | 'gin' | 'error' | 'sys' | 'info';
  success: boolean;
  statusCode?: number;
  message: string;
  detail: Record<string, unknown> | null;
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
