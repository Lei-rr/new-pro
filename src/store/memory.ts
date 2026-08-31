import type { Lifecycle } from '../core/container.js';
import { createLogger } from '../core/logger.js';
import { getEnv } from '../env.js';
import type { ParsedLogEntry, ConsumeLogEntry, GinLogEntry, ErrorLogEntry } from '../types/log.js';
import { isConsume, isGin, isError } from '../types/log.js';
import { QUOTA_PER_COST_UNIT, toDateString, toHourKey } from '../utils/format.js';
import type { IStore, LogSearchFilter } from './interface.js';
import type { DimensionType, DimensionQuery, DimensionStats, TimelineBucket, OverviewSummary, CostTrendPoint } from '../types/stats.js';
import { DimensionIndex } from './indexes.js';

const log = createLogger('store');

/** Max correlation entries kept */
const MAX_MAP_SIZE = 50_000;

interface HourBucket {
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
  frtSum: number;
  frtCount: number;
  models: Set<string>;
  channels: Set<number>;
  tokens: Set<string>;
  users: Set<number>;
  groups: Set<string>;
}

function newBucket(): HourBucket {
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
    frtSum: 0,
    frtCount: 0,
    models: new Set(),
    channels: new Set(),
    tokens: new Set(),
    users: new Set(),
    groups: new Set(),
  };
}

/**
 * In-memory store with multi-dimension indexes and bidirectional IP correlation.
 * Implements IStore for query interface and Lifecycle for startup/shutdown.
 */
export class MemoryStore implements IStore, Lifecycle {
  // Typed entry arrays
  private consumeEntries: ConsumeLogEntry[] = [];
  private ginEntries: GinLogEntry[] = [];
  private errorEntries: ErrorLogEntry[] = [];

  // Dimension indexes (single generic class for all)
  private indexes: Record<DimensionType, DimensionIndex> = {
    channel: new DimensionIndex(),
    model:   new DimensionIndex(),
    token:   new DimensionIndex(),
    user:    new DimensionIndex(),
    ip:      new DimensionIndex(),
    group:   new DimensionIndex(),
  };

  // Time buckets
  private hourly = new Map<string, HourBucket>();
  private dailyCost = new Map<string, { quota: number; requests: number }>();

  // Global counters (monotonic since startup; unaffected by eviction)
  private totalEntries = 0;
  private ginTotal = 0;            // All HTTP requests
  private totalErrors = 0;         // GIN status >= 400
  private errorLogCount = 0;       // [ERR] lines
  private totalGinDurationMs = 0;
  private consumeTotal = 0;        // Billed requests
  private streamCount = 0;         // Stream requests
  private clientGoneCount = 0;     // Interrupted / canceled
  private totalPromptTokens = 0;
  private totalCompletionTokens = 0;
  private totalQuota = 0;
  private cacheTokensTotal = 0;
  private totalResponseTime = 0;
  private totalFrt = 0;
  private frtCount = 0;
  private firstEntry: Date | null = null;
  private lastEntry: Date | null = null;

  // Bidirectional correlation: requestId <-> (ip / consumeEntry)
  private requestIpMap = new Map<string, string>();
  private pendingConsumeMap = new Map<string, ConsumeLogEntry>();
  private pruneTimer: ReturnType<typeof setInterval> | null = null;

  // ─── Lifecycle ───

  async start(): Promise<void> {
    this.pruneTimer = setInterval(() => this.prune(), 60_000);
    this.pruneTimer.unref();
    this.prune();
    log.info('MemoryStore initialized');
  }

  async stop(): Promise<void> {
    if (this.pruneTimer) {
      clearInterval(this.pruneTimer);
      this.pruneTimer = null;
    }
    log.info({
      consume: this.consumeEntries.length,
      gin: this.ginEntries.length,
      errors: this.errorEntries.length,
    }, 'MemoryStore shutdown stats');
  }

  // ─── Ingest ───

  append(entry: ParsedLogEntry): void {
    this.trackTime(entry);

    if (isConsume(entry)) {
      this.ingestConsume(entry);
    } else if (isGin(entry)) {
      this.ingestGin(entry);
    } else if (isError(entry)) {
      this.ingestError(entry);
    }
  }

  appendBatch(entries: ParsedLogEntry[]): void {
    for (let i = 0; i < entries.length; i++) {
      this.append(entries[i]);
    }
    log.info({ count: entries.length, total: this.totalEntries }, 'Batch ingested');
  }

  private trackTime(entry: ParsedLogEntry): void {
    if (!this.firstEntry || entry.timestamp < this.firstEntry) {
      this.firstEntry = entry.timestamp;
    }
    if (!this.lastEntry || entry.timestamp > this.lastEntry) {
      this.lastEntry = entry.timestamp;
    }
  }

  private ingestConsume(e: ConsumeLogEntry): void {
    this.consumeEntries.push(e);
    this.totalEntries++;
    this.consumeTotal++;

    const p = e.params;
    if (p.is_stream) this.streamCount++;
    if (p.other?.stream_status?.end_reason === 'client_gone') this.clientGoneCount++;

    // Check if GIN relay already arrived with client IP
    const ip = this.requestIpMap.get(e.requestId);
    if (ip !== undefined) {
      this.requestIpMap.delete(e.requestId);
      e.ip = ip;
      this.indexes.ip.ingest(ip, e);
    } else {
      // Consume log arrives before GIN log; save for correlation when GIN arrives
      this.pendingConsumeMap.set(e.requestId, e);
      if (this.pendingConsumeMap.size > MAX_MAP_SIZE) {
        const oldest = this.pendingConsumeMap.keys().next().value;
        if (oldest !== undefined) this.pendingConsumeMap.delete(oldest);
      }
    }

    // Update dimension indexes (channel, model, token, user, group)
    this.indexes.channel.ingest(String(p.channel_id), e);
    this.indexes.model.ingest(p.model_name, e);
    this.indexes.token.ingest(p.token_name, e);
    this.indexes.user.ingest(String(e.userId), e);
    if (p.group) this.indexes.group.ingest(p.group, e);

    // Hourly bucket
    const hk = toHourKey(e.timestamp);
    let bucket = this.hourly.get(hk);
    if (!bucket) {
      bucket = newBucket();
      this.hourly.set(hk, bucket);
    }
    bucket.consumes++;
    if (p.is_stream) bucket.streamCount++;
    if (p.other?.stream_status?.end_reason === 'client_gone') bucket.clientGoneCount++;
    bucket.promptTokens += p.prompt_tokens;
    bucket.completionTokens += p.completion_tokens;
    bucket.quota += p.quota;
    bucket.cacheTokens += p.other?.cache_tokens ?? 0;
    bucket.totalTime += p.use_time_seconds;
    const frt = p.other?.frt ?? -1;
    if (frt > 0) {
      bucket.frtSum += frt;
      bucket.frtCount++;
    }
    bucket.models.add(p.model_name);
    bucket.channels.add(p.channel_id);
    bucket.tokens.add(p.token_name);
    bucket.users.add(e.userId);
    if (p.group) bucket.groups.add(p.group);

    // Daily cost
    const dk = toDateString(e.timestamp);
    let day = this.dailyCost.get(dk);
    if (!day) {
      day = { quota: 0, requests: 0 };
      this.dailyCost.set(dk, day);
    }
    day.quota += p.quota;
    day.requests++;

    // Global counters (monotonic)
    this.totalPromptTokens += p.prompt_tokens;
    this.totalCompletionTokens += p.completion_tokens;
    this.totalQuota += p.quota;
    this.cacheTokensTotal += p.other?.cache_tokens ?? 0;
    this.totalResponseTime += p.use_time_seconds;
    if (frt > 0) {
      this.totalFrt += frt;
      this.frtCount++;
    }

    // Eviction check
    this.maybeEvict();
  }

  private ingestGin(e: GinLogEntry): void {
    this.ginEntries.push(e);
    this.totalEntries++;
    this.ginTotal++;
    this.totalGinDurationMs += e.durationMs;

    // Hourly bucket: requests count at HTTP level
    const hk = toHourKey(e.timestamp);
    let bucket = this.hourly.get(hk);
    if (!bucket) {
      bucket = newBucket();
      this.hourly.set(hk, bucket);
    }
    bucket.requests++;

    if (e.routeType === 'relay') {
      // Check if matching consume log already arrived
      const consume = this.pendingConsumeMap.get(e.requestId);
      if (consume !== undefined) {
        this.pendingConsumeMap.delete(e.requestId);
        consume.ip = e.ip;
        this.indexes.ip.ingest(e.ip, consume);
      } else {
        // Record IP request (without consume tokens) and save for later consume log
        this.indexes.ip.ingestIpRequest(e.ip, e.durationMs, e.timestamp.getTime());
        this.requestIpMap.set(e.requestId, e.ip);
        if (this.requestIpMap.size > MAX_MAP_SIZE) {
          const oldest = this.requestIpMap.keys().next().value;
          if (oldest !== undefined) this.requestIpMap.delete(oldest);
        }
      }
    }

    // HTTP level errors (status >= 400)
    if (e.statusCode >= 400) {
      this.totalErrors++;
      bucket.errors++;
      if (e.routeType === 'relay') {
        this.indexes.ip.addError(e.ip, e.timestamp.getTime());
      }
    }
  }

  private ingestError(e: ErrorLogEntry): void {
    this.errorEntries.push(e);
    this.totalEntries++;
    this.errorLogCount++;

    const msg = e.message;
    if (msg.includes('client_gone')) {
      this.clientGoneCount++;
    }

    // Attribute channel failures (e.g. "channel error (channel #31, status code: 503)")
    const channelMatch = msg.match(/channel\s*#(\d+)/i);
    if (channelMatch) {
      const channelId = channelMatch[1];
      this.indexes.channel.addError(channelId, e.timestamp.getTime());
    }
  }

  private maybeEvict(): void {
    const max = getEnv().MAX_ENTRIES;
    if (this.consumeEntries.length > max) {
      this.consumeEntries.splice(0, Math.floor(max * 0.1));
    }
    if (this.ginEntries.length > max) {
      this.ginEntries.splice(0, Math.floor(max * 0.1));
    }
    if (this.errorEntries.length > max) {
      this.errorEntries.splice(0, Math.floor(max * 0.1));
    }
  }

  /** Periodic retention cleanup for buckets and dimension indexes. */
  private prune(): void {
    const now = Date.now();
    const retentionMs = Math.max(getEnv().RETENTION_HOURS, 1) * 3_600_000;
    const bucketCutoff = now - retentionMs;

    for (const key of this.hourly.keys()) {
      if (new Date(key).getTime() < bucketCutoff) this.hourly.delete(key);
    }

    // Keep daily cost for the maximum queryable window (90 days)
    const dayCutoff = toDateString(new Date(now - 90 * 86_400_000));
    for (const key of this.dailyCost.keys()) {
      if (key < dayCutoff) this.dailyCost.delete(key);
    }

    for (const index of Object.values(this.indexes)) {
      index.pruneBefore(bucketCutoff);
    }
  }

  // ─── Query: Overview ───

  getSummary(start?: number, end?: number): OverviewSummary {
    if (start === undefined && end === undefined) {
      // All-time summary
      const totalRequests = this.ginTotal;
      return {
        totalRequests,
        billingRequests: this.consumeTotal,
        totalPromptTokens: this.totalPromptTokens,
        totalCompletionTokens: this.totalCompletionTokens,
        totalQuota: this.totalQuota,
        totalCost: this.totalQuota / QUOTA_PER_COST_UNIT,
        errorCount: this.totalErrors,
        errorLogCount: this.errorLogCount,
        errorRate: totalRequests > 0 ? this.totalErrors / totalRequests : 0,
        cacheHitRate: this.totalPromptTokens > 0 ? this.cacheTokensTotal / this.totalPromptTokens : 0,
        streamRatio: this.consumeTotal > 0 ? this.streamCount / this.consumeTotal : 0,
        clientGoneCount: this.clientGoneCount,
        activeModels: this.indexes.model.size,
        activeChannels: this.indexes.channel.size,
        activeUsers: this.indexes.user.size,
        activeTokens: this.indexes.token.size,
        activeIps: this.indexes.ip.size,
        activeGroups: this.indexes.group.size,
        avgResponseTime: totalRequests > 0 ? this.totalGinDurationMs / totalRequests / 1000 : 0,
        avgFrt: this.frtCount > 0 ? this.totalFrt / this.frtCount : 0,
        cacheHitTokens: this.cacheTokensTotal,
        firstEntry: this.firstEntry?.getTime() ?? null,
        lastEntry: this.lastEntry?.getTime() ?? null,
        uptimeSeconds: process.uptime(),
      };
    }

    // Time-range aggregated summary from hourly buckets
    const startMs = start ?? 0;
    const endMs = end ?? Date.now();

    let requests = 0;
    let errors = 0;
    let consumes = 0;
    let streamCount = 0;
    let clientGoneCount = 0;
    let promptTokens = 0;
    let completionTokens = 0;
    let quota = 0;
    let cacheTokens = 0;
    let totalTime = 0;
    let frtSum = 0;
    let frtCount = 0;
    const models = new Set<string>();
    const channels = new Set<number>();
    const tokens = new Set<string>();
    const users = new Set<number>();
    const groups = new Set<string>();

    for (const [key, b] of this.hourly) {
      const t = new Date(key).getTime();
      if (t < startMs || t > endMs) continue;
      requests += b.requests;
      errors += b.errors;
      consumes += (b.consumes ?? 0);
      streamCount += (b.streamCount ?? 0);
      clientGoneCount += (b.clientGoneCount ?? 0);
      promptTokens += b.promptTokens;
      completionTokens += b.completionTokens;
      quota += b.quota;
      cacheTokens += b.cacheTokens;
      totalTime += (b.totalTime ?? 0);
      frtSum += (b.frtSum ?? 0);
      frtCount += (b.frtCount ?? 0);
      for (const m of b.models) models.add(m);
      for (const c of b.channels) channels.add(c);
      for (const tk of b.tokens) tokens.add(tk);
      for (const u of b.users) users.add(u);
      for (const g of b.groups) groups.add(g);
    }

    return {
      totalRequests: requests,
      billingRequests: consumes,
      totalPromptTokens: promptTokens,
      totalCompletionTokens: completionTokens,
      totalQuota: quota,
      totalCost: quota / QUOTA_PER_COST_UNIT,
      errorCount: errors,
      errorLogCount: this.errorLogCount,
      errorRate: requests > 0 ? errors / requests : 0,
      cacheHitRate: promptTokens > 0 ? cacheTokens / promptTokens : 0,
      streamRatio: consumes > 0 ? streamCount / consumes : 0,
      clientGoneCount,
      activeModels: models.size,
      activeChannels: channels.size,
      activeUsers: users.size,
      activeTokens: tokens.size,
      activeIps: this.indexes.ip.size,
      activeGroups: groups.size,
      avgResponseTime: consumes > 0 ? totalTime / consumes : (requests > 0 ? this.totalGinDurationMs / this.ginTotal / 1000 : 0),
      avgFrt: frtCount > 0 ? frtSum / frtCount : 0,
      cacheHitTokens: cacheTokens,
      firstEntry: startMs,
      lastEntry: endMs,
      uptimeSeconds: process.uptime(),
    };
  }

  // ─── Query: Timeline ───

  getTimeline(hours: number): TimelineBucket[] {
    const now = new Date();
    const cutoff = new Date(now.getTime() - hours * 3600_000);

    const result: TimelineBucket[] = [];
    const sorted = [...this.hourly.entries()]
      .filter(([k]) => new Date(k) >= cutoff)
      .sort(([a], [b]) => a.localeCompare(b));

    for (const [time, b] of sorted) {
      result.push({
        time,
        requests: b.requests,
        promptTokens: b.promptTokens,
        completionTokens: b.completionTokens,
        quota: b.quota,
        errors: b.errors,
        models: b.models.size,
        users: b.users.size,
      });
    }
    return result;
  }

  // ─── Query: Dimension ───

  getDimensionStats(
    dimension: DimensionType,
    query?: DimensionQuery,
  ): { total: number; data: DimensionStats[] } {
    const index = this.indexes[dimension];
    if (!index) return { total: 0, data: [] };
    return index.query(query);
  }

  // ─── Query: Cost ───

  getCostTrend(days: number): CostTrendPoint[] {
    const entries = [...this.dailyCost.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .slice(0, days);

    return entries.map(([date, d]) => ({
      date,
      quota: d.quota,
      cost: d.quota / QUOTA_PER_COST_UNIT,
      requests: d.requests,
    })).reverse();
  }

  // ─── Query: Logs ───

  getRecentConsumeLogs(limit: number, offset = 0): { total: number; data: ParsedLogEntry[] } {
    const total = this.consumeEntries.length;
    const end = Math.max(0, total - offset);
    const start = Math.max(0, end - limit);
    return {
      total,
      data: this.consumeEntries.slice(start, end).reverse(),
    };
  }

  searchLogs(filter: LogSearchFilter): { total: number; data: ParsedLogEntry[] } {
    const limit = filter.limit ?? 50;
    const offset = filter.offset ?? 0;
    const results: ConsumeLogEntry[] = [];
    let matchCount = 0;

    for (let i = this.consumeEntries.length - 1; i >= 0; i--) {
      const e = this.consumeEntries[i];
      const ts = e.timestamp.getTime();

      // Time range filter
      if (filter.start !== undefined && ts < filter.start) continue;
      if (filter.end !== undefined && ts > filter.end) continue;

      if (filter.model && e.params.model_name !== filter.model) continue;
      if (filter.user && String(e.userId) !== filter.user) continue;
      if (filter.channel && String(e.params.channel_id) !== filter.channel) continue;
      if (filter.ip && e.ip !== filter.ip) continue;
      if (filter.q) {
        const q = filter.q.toLowerCase();
        if (
          !e.params.model_name.toLowerCase().includes(q) &&
          !e.params.token_name.toLowerCase().includes(q) &&
          !e.params.group.toLowerCase().includes(q)
        ) continue;
      }

      if (matchCount >= offset && results.length < limit) {
        results.push(e);
      }
      matchCount++;
    }

    return {
      total: matchCount,
      data: results,
    };
  }

  // ─── Counts ───

  getEntryCount(): number { return this.totalEntries; }
  getConsumeCount(): number { return this.consumeEntries.length; }
}
