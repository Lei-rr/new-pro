/** DB 行类型（snake_case） */
export interface LogRow {
  id: string;
  created_at: number;
  type: number;
  model_name: string | null;
  channel_id: number | null;
  channel_name: string | null;
  quota: number;
  prompt_tokens: number;
  completion_tokens: number;
  is_stream: boolean | null;
  ip: string | null;
  request_id: string;
  username: string | null;
  token_name: string | null;
  group: string | null;
  content: string | null;
}

// ─── API DTO（camelCase） ───

export interface LogEntryDto {
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

export interface LogStreamResponse {
  total: number;
  count: number;
  offset: number;
  limit: number;
  data: LogEntryDto[];
}
