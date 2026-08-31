// ─── 与后端 DTO 一一对应 ───

export interface OverviewSummary {
  /** 全部 HTTP 请求数（来自 GIN 日志） */
  totalRequests: number;
  /** 计费请求数（consume 记录） */
  billingRequests: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalQuota: number;
  totalCost: number;
  /** HTTP 请求失败数（GIN status >= 400） */
  errorCount: number;
  /** 错误日志行数（ERR 行，渠道级诊断） */
  errorLogCount: number;
  errorRate: number;
  /** Prompt 缓存命中率 (cache_tokens / prompt_tokens) */
  cacheHitRate: number;
  /** 流式请求比例 */
  streamRatio: number;
  /** 客户端主动取消数 (client_gone) */
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
  offset?: number;
  limit?: number;
  count?: number;
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
  pluginDetails: {
    totalQuota?: number;
    totalCost?: number;
    totalRequests?: number;
    todayQuota?: number;
    todayCost?: number;
    avgCostPerRequest?: number;
  };
}

export interface LogEntry {
  timestamp: number;
  requestId: string;
  userId: number;
  ip: string | null;
  ipLocation?: string;
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

export interface LogListResponse {
  total: number;
  count: number;
  offset?: number;
  limit?: number;
  data: LogEntry[];
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

// ─── WebSocket 消息 ───

export interface WsSnapshotData {
  summary: OverviewSummary;
  plugins: Record<string, Record<string, unknown>>;
  alerts: Alert[];
}

export interface WsStatsUpdateData {
  summary: OverviewSummary;
  alerts: Alert[];
}

export type WsMessage =
  | { type: 'snapshot'; data: WsSnapshotData }
  | { type: 'stats_update'; data: WsStatsUpdateData }
  | { type: 'new_logs'; data: unknown[] }
  | { type: 'alert'; data: Alert };
