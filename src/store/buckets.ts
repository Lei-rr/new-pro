/**
 * Hourly aggregation bucket for timeline and windowed summaries.
 */
export interface HourBucket {
  requests: number;        // GIN HTTP requests
  errors: number;          // GIN status >= 400
  consumes: number;        // Consume / billed requests in that hour
  streamCount: number;     // Stream requests
  clientGoneCount: number; // Client cancel count
  promptTokens: number;
  completionTokens: number;
  quota: number;
  cacheTokens: number;
  totalTime: number;       // Sum of consume use_time_seconds
  ginDurationMs: number;   // Sum of GIN request durations (for avgResponseTime)
  errorLogCount: number;   // ERR diagnostic lines in this hour
  frtSum: number;
  frtCount: number;
  models: Set<string>;
  channels: Set<number>;
  tokens: Set<string>;
  users: Set<number>;
  groups: Set<string>;
}

export function newBucket(): HourBucket {
  return {
    requests: 0,
    errors: 0,
    consumes: 0,
    streamCount: 0,
    clientGoneCount: 0,
    promptTokens: 0,
    completionTokens: 0,
    quota: 0,
    cacheTokens: 0,
    totalTime: 0,
    ginDurationMs: 0,
    errorLogCount: 0,
    frtSum: 0,
    frtCount: 0,
    models: new Set(),
    channels: new Set(),
    tokens: new Set(),
    users: new Set(),
    groups: new Set(),
  };
}
