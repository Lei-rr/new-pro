import type { LogEntry } from './types';

/**
 * WebSocket 推送的是后端原始 ParsedLogEntry（含 params 结构），
 * 这里映射为前端全字段的 LogEntry。
 */

interface RawOther {
  cache_tokens?: number;
  frt?: number;
  request_path?: string;
  billing_source?: string;
  billing_mode?: string;
  stream_status?: { status?: string };
  model_ratio?: number;
  model_price?: number;
  completion_ratio?: number;
  group_ratio?: number;
  user_group_ratio?: number;
  cache_ratio?: number;
  matched_tier?: string;
  admin_info?: { use_channel?: string[] };
}

interface RawConsumeEntry {
  level: string;
  kind?: string;
  timestamp: string;
  requestId?: string;
  userId?: number;
  ip?: string;
  params?: {
    channel_id: number;
    prompt_tokens: number;
    completion_tokens: number;
    model_name: string;
    token_name: string;
    quota: number;
    content: string;
    token_id: number;
    use_time_seconds: number;
    is_stream: boolean;
    group: string;
    other?: RawOther;
  };
}

export function mapWsEntry(raw: unknown): LogEntry | null {
  const e = raw as RawConsumeEntry;
  if (!e || e.kind !== 'consume' || !e.params) return null;
  const p = e.params;
  const other = p.other ?? {};
  return {
    timestamp: new Date(e.timestamp).getTime(),
    requestId: e.requestId ?? '',
    userId: e.userId ?? 0,
    ip: e.ip ?? null,
    channelId: p.channel_id,
    model: p.model_name,
    tokenName: p.token_name,
    tokenId: p.token_id,
    promptTokens: p.prompt_tokens,
    completionTokens: p.completion_tokens,
    cacheTokens: other.cache_tokens ?? 0,
    quota: p.quota,
    cost: p.quota / 500_000,
    useTime: p.use_time_seconds,
    frt: other.frt ?? null,
    isStream: p.is_stream,
    group: p.group || 'default',
    requestPath: other.request_path ?? null,
    billingSource: other.billing_source ?? null,
    billingMode: other.billing_mode ?? null,
    streamStatus: other.stream_status?.status ?? null,
    modelRatio: other.model_ratio ?? null,
    modelPrice: other.model_price ?? null,
    completionRatio: other.completion_ratio ?? null,
    groupRatio: other.group_ratio ?? null,
    userGroupRatio: other.user_group_ratio ?? null,
    cacheRatio: other.cache_ratio ?? null,
    matchedTier: other.matched_tier ?? null,
    adminUseChannel: other.admin_info?.use_channel ?? null,
  };
}
