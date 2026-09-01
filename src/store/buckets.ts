/**
 * Aggregation buckets.
 *
 * Two granularities:
 * - HourBucket: timeline chart + long-range summaries (24h/7d/30d)
 * - MinuteBucket: exact sliding-window summaries (1h/6h) — hourly buckets
 *   would keep up to 59 minutes of expired data inside the boundary hour.
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

/** Numeric-only minute bucket (no Sets: windowed scans must stay cheap). */
export interface MinuteBucket {
  requests: number;
  errors: number;
  consumes: number;
  streamCount: number;
  clientGoneCount: number;
  promptTokens: number;
  completionTokens: number;
  quota: number;
  cacheTokens: number;
  totalTime: number;
  ginDurationMs: number;
  errorLogCount: number;
  frtSum: number;
  frtCount: number;
}

export function newMinuteBucket(): MinuteBucket {
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
  };
}
