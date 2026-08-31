// ─── Log Level ───

export type LogLevel = 'SYS' | 'GIN' | 'INFO' | 'ERR' | 'WARN';

// ─── Base ───

export interface BaseLogEntry {
  level: LogLevel;
  timestamp: Date;
  sourceFile: string;
}

// ─── SYS: system startup/status ───

export interface SysLogEntry extends BaseLogEntry {
  level: 'SYS';
  message: string;
}

// ─── GIN: HTTP request log ───

export interface GinLogEntry extends BaseLogEntry {
  level: 'GIN';
  routeType: string;       // web | api | relay
  requestId: string;
  statusCode: number;
  duration: string;
  durationMs: number;
  ip: string;
  method: string;
  path: string;
}

// ─── Consume: the core billing record ───

export interface ConsumeOther {
  admin_info?: {
    usage_billing_path?: string;
    use_channel?: string[];
    channel_affinity?: Record<string, unknown>;
  };
  billing_source?: string;
  billing_mode?: string;
  cache_ratio?: number;
  cache_tokens?: number;
  completion_ratio?: number;
  frt?: number;                      // first-token response time (ms)
  group_ratio?: number;
  model_price?: number;
  model_ratio?: number;
  request_conversion?: string[];
  request_path?: string;
  stream_status?: {
    end_reason?: string;
    status?: string;
  };
  user_group_ratio?: number;
  reasoning_effort?: string;
  matched_tier?: string;
  expr_b64?: string;
  [key: string]: unknown;
}

export interface ConsumeParams {
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
  other: ConsumeOther;
}

export interface ConsumeLogEntry extends BaseLogEntry {
  level: 'INFO';
  kind: 'consume';
  requestId: string;
  userId: number;
  params: ConsumeParams;
  /** Client IP correlated from the matching GIN relay entry (if found) */
  ip?: string;
}

// ─── Generic INFO ───

export interface InfoLogEntry extends BaseLogEntry {
  level: 'INFO';
  kind: 'info';
  requestId: string;
  message: string;
}

// ─── ERR ───

export interface ErrorLogEntry extends BaseLogEntry {
  level: 'ERR';
  requestId: string;
  message: string;
}

// ─── Union ───

export type ParsedLogEntry =
  | SysLogEntry
  | GinLogEntry
  | ConsumeLogEntry
  | InfoLogEntry
  | ErrorLogEntry;

// ─── Type guards ───

export function isConsume(e: ParsedLogEntry): e is ConsumeLogEntry {
  return e.level === 'INFO' && 'kind' in e && e.kind === 'consume';
}

export function isGin(e: ParsedLogEntry): e is GinLogEntry {
  return e.level === 'GIN';
}

export function isError(e: ParsedLogEntry): e is ErrorLogEntry {
  return e.level === 'ERR';
}
