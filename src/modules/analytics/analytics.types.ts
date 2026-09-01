/** DB 行类型（snake_case，与 SQL 返回一致） */
export interface SummaryRow {
  consumes: string;
  prompt: string;
  completion: string;
  quota: string;
  use_time: string;
  stream: string;
  errors: string;
}

export interface DistinctRow {
  models: string;
  channels: string;
  users: string;
  tokens: string;
  groups: string;
  first_entry: string | null;
  last_entry: string | null;
}

export interface TimelineRow {
  bucket: string;
  requests: string;
  prompt_tokens: string;
  completion_tokens: string;
  quota: string;
}

export interface DimensionRow {
  key: string;
  requests: string;
  prompt_tokens: string;
  completion_tokens: string;
  total_tokens: string;
  quota: string;
  total_time: string;
  first_seen: string;
  last_seen: string;
}

// ─── API DTO（camelCase） ───

export interface SummaryDto {
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

export interface TimelineDto {
  time: string;
  requests: number;
  promptTokens: number;
  completionTokens: number;
  quota: number;
}

export type DimensionKey = 'model' | 'channel' | 'token' | 'user' | 'group';

export interface DimensionDto {
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

export interface ChannelHealthDto {
  key: string;
  requests: number;
  errors: number;
  errorRate: number;
}

export interface DashboardResponse {
  days: number;
  start: number;
  end: number;
  summary: SummaryDto;
  prevSummary: SummaryDto;
  timeline: TimelineDto[];
  topModels: DimensionDto[];
  topChannels: DimensionDto[];
  topUsers: DimensionDto[];
  channelHealth: ChannelHealthDto[];
  alerts: unknown[];
}

export interface CostAnalyticsResponse {
  totalQuota: number;
  totalCost: number;
  billingRequests: number;
  avgCostPerRequest: number;
  todayCost: number;
  todayRequests: number;
  trend: Array<{ date: string; quota: number; cost: number; requests: number }>;
  tokenTop: DimensionDto[];
  modelTop: DimensionDto[];
}
