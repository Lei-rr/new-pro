// ─── Dimension Analysis ───

export type DimensionType = 'channel' | 'model' | 'token' | 'user' | 'ip' | 'group';

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
  firstSeen: number;   // epoch ms
  lastSeen: number;    // epoch ms
}

export interface DimensionQuery {
  start?: number;      // epoch ms
  end?: number;        // epoch ms
  sort?: 'requests' | 'tokens' | 'quota' | 'errors' | 'cost' | 'frt';
  limit?: number;
  offset?: number;
}

// ─── Timeline ───

export interface TimelineBucket {
  time: string;        // ISO hour string
  requests: number;
  promptTokens: number;
  completionTokens: number;
  quota: number;
  errors: number;
  models: number;
  users: number;
}

// ─── Overview ───

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

// ─── Cost ───

export interface CostTrendPoint {
  date: string;        // YYYY-MM-DD
  quota: number;
  cost: number;
  requests: number;
}

// ─── Alert ───

export type AlertSeverity = 'info' | 'warning' | 'critical';

export interface Alert {
  id: string;
  ruleId: string;
  severity: AlertSeverity;
  message: string;
  timestamp: number;
  details?: Record<string, unknown>;
}
