import type { Lifecycle } from '../core/container.js';
import { createLogger } from '../core/logger.js';
import { getEnv } from '../env.js';
import type { ParsedLogEntry, ConsumeLogEntry, GinLogEntry, ErrorLogEntry } from '../types/log.js';
import { isConsume, isGin, isError } from '../types/log.js';
import { QUOTA_PER_COST_UNIT } from '../constants.js';
import { hourKeyToEpochMs, toDateString, toHourKey } from '../utils/time.js';
import type { IStore, LogSearchFilter, RawLogFilter } from './interface.js';
import type { DimensionType, DimensionQuery, DimensionStats, TimelineBucket, OverviewSummary, CostTrendPoint } from '../types/stats.js';
import { DimensionIndex } from './indexes.js';
import { newBucket, type HourBucket } from './buckets.js';
import { RequestCorrelator } from './correlation.js';
import { ReplayGuard } from './dedup.js';

const log = createLogger('store');

/** Raw log viewer ring buffer capacity. */
const RAW_LOG_BUFFER_MAX = 200_000;

/**
 * In-memory store with multi-dimension indexes and bidirectional IP correlation.
 * Implements IStore for query interface and Lifecycle for startup/shutdown.
 */
export class MemoryStore implements IStore, Lifecycle {
  /** Business timezone for day/hour bucketing (from LOG_TZ). */
  private get tz(): string {
    return getEnv().LOG_TZ;
  }

  // Typed entry arrays
  private consumeEntries: ConsumeLogEntry[] = [];
  private ginEntries: GinLogEntry[] = [];
  private errorEntries: ErrorLogEntry[] = [];

  /** Raw stream of every parsed line (bounded ring buffer, for the viewer). */
  private rawLogs: ParsedLogEntry[] = [];

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

  // Bidirectional request correlation + replay protection
  private correlator = new RequestCorrelator();
  private replayGuard = new ReplayGuard();
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
    // Replay guard: skip entries already ingested (file re-reads after
    // rotation/truncation would otherwise double all counters).
    if (this.replayGuard.checkAndRemember(entry)) return;

    // Raw stream: keep every parsed line (GIN/consume/ERR/INFO/SYS) in
    // ingestion order for the log viewer. Bounded ring buffer.
    this.rawLogs.push(entry);
    if (this.rawLogs.length > RAW_LOG_BUFFER_MAX) {
      this.rawLogs.splice(0, this.rawLogs.length - RAW_LOG_BUFFER_MAX);
    }

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
    log.debug({ count: entries.length, total: this.totalEntries }, 'Batch ingested');
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

    // Correlate with the GIN relay entry (either side may have arrived first)
    const ip = this.correlator.onConsume(e);
    if (ip !== undefined) {
      // GIN already counted this request (ingestIpRequest); attach consume
      // details only, so the IP dimension counts the request exactly once.
      this.indexes.ip.addConsumeParams(ip, e);
    }

    // Update dimension indexes (channel, model, token, user, group)
    this.indexes.channel.ingest(String(p.channel_id), e);
    this.indexes.model.ingest(p.model_name, e);
    this.indexes.token.ingest(p.token_name, e);
    this.indexes.user.ingest(String(e.userId), e);
    if (p.group) this.indexes.group.ingest(p.group, e);

    // Hourly bucket
    const hk = toHourKey(e.timestamp, this.tz);
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
    const dk = toDateString(e.timestamp, this.tz);
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
    const hk = toHourKey(e.timestamp, this.tz);
    let bucket = this.hourly.get(hk);
    if (!bucket) {
      bucket = newBucket();
      this.hourly.set(hk, bucket);
    }
    bucket.requests++;
    bucket.ginDurationMs += e.durationMs;

    if (e.routeType === 'relay') {
      // Correlate with the consume entry (either side may have arrived first).
      // One relay request → one request count (GIN is the source of truth),
      // consume details attach without re-counting.
      const consume = this.correlator.onGin(e.requestId, e.ip);
      this.indexes.ip.ingestIpRequest(e.ip, e.durationMs, e.timestamp.getTime());
      if (consume !== undefined) {
        this.indexes.ip.addConsumeParams(e.ip, consume);
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

    // NOTE: "client_gone" in ERR lines describes the same cancellation event
    // that consume records as stream_status.end_reason === 'client_gone'.
    // clientGoneCount is only incremented from consume entries to avoid
    // double counting one logical event.

    // Hourly bucket for ERR diagnostic lines (windowed summaries)
    const hk = toHourKey(e.timestamp, this.tz);
    let bucket = this.hourly.get(hk);
    if (!bucket) {
      bucket = newBucket();
      this.hourly.set(hk, bucket);
    }
    bucket.errorLogCount++;

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
      if (hourKeyToEpochMs(key, this.tz) < bucketCutoff) this.hourly.delete(key);
    }

    // Keep daily cost for the maximum queryable window (90 days)
    const dayCutoff = toDateString(new Date(now - 90 * 86_400_000), this.tz);
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
    let ginDurationMs = 0;
    let errorLogCount = 0;
    let frtSum = 0;
    let frtCount = 0;
    let firstBucketMs: number | null = null;
    let lastBucketMs: number | null = null;
    const models = new Set<string>();
    const channels = new Set<number>();
    const tokens = new Set<string>();
    const users = new Set<number>();
    const groups = new Set<string>();

    for (const [key, b] of this.hourly) {
      const t = hourKeyToEpochMs(key, this.tz);
      if (t < startMs || t > endMs) continue;
      if (firstBucketMs === null || t < firstBucketMs) firstBucketMs = t;
      if (lastBucketMs === null || t > lastBucketMs) lastBucketMs = t;
      requests += b.requests;
      errors += b.errors;
      consumes += (b.consumes ?? 0);
      streamCount += (b.streamCount ?? 0);
      clientGoneCount += (b.clientGoneCount ?? 0);
      promptTokens += b.promptTokens;
      completionTokens += b.completionTokens;
      quota += b.quota;
      cacheTokens += b.cacheTokens;
      ginDurationMs += b.ginDurationMs;
      errorLogCount += b.errorLogCount;
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
      errorLogCount,
      errorRate: requests > 0 ? errors / requests : 0,
      cacheHitRate: promptTokens > 0 ? cacheTokens / promptTokens : 0,
      streamRatio: consumes > 0 ? streamCount / consumes : 0,
      clientGoneCount,
      activeModels: models.size,
      activeChannels: channels.size,
      activeUsers: users.size,
      activeTokens: tokens.size,
      // IP activity in the window, from the IP dimension index (not global)
      activeIps: this.indexes.ip.countActiveInRange(startMs, endMs),
      activeGroups: groups.size,
      // GIN-duration caliber, same as the all-time summary
      avgResponseTime: requests > 0 ? ginDurationMs / requests / 1000 : 0,
      avgFrt: frtCount > 0 ? frtSum / frtCount : 0,
      cacheHitTokens: cacheTokens,
      firstEntry: firstBucketMs,
      lastEntry: lastBucketMs,
      uptimeSeconds: process.uptime(),
    };
  }

  // ─── Query: Timeline ───

  getTimeline(hours: number): TimelineBucket[] {
    const now = new Date();
    const cutoff = new Date(now.getTime() - hours * 3600_000);

    const result: TimelineBucket[] = [];
    const sorted = [...this.hourly.entries()]
      .filter(([k]) => hourKeyToEpochMs(k, this.tz) >= cutoff.getTime())
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

  getRawLogs(filter: RawLogFilter): { total: number; data: ParsedLogEntry[] } {
    const limit = filter.limit ?? 50;
    const offset = filter.offset ?? 0;
    const results: ParsedLogEntry[] = [];
    let matchCount = 0;

    for (let i = this.rawLogs.length - 1; i >= 0; i--) {
      const e = this.rawLogs[i];
      const ts = e.timestamp.getTime();

      if (filter.start !== undefined && ts < filter.start - 60_000) break;
      if (filter.end !== undefined && ts > filter.end) continue;

      // Status filter: success/failure 依据日志等级与 HTTP 状态
      if (filter.kind && filter.kind !== 'all') {
        if (filter.kind === 'success') {
          const ok = isGin(e) ? e.statusCode < 400 : !isError(e);
          if (!ok) continue;
        } else if (filter.kind === 'failure') {
          const fail = isGin(e) ? e.statusCode >= 400 : isError(e);
          if (!fail) continue;
        } else if (filter.kind === 'consume' && !isConsume(e)) {
          continue;
        } else if (filter.kind === 'gin' && !isGin(e)) {
          continue;
        } else if (filter.kind === 'error' && !isError(e)) {
          continue;
        }
      }

        if (filter.q) {
          const q = filter.q.toLowerCase();
          let haystack = '';
          if (isConsume(e)) {
            haystack = `${e.params.model_name} ${e.params.token_name} ${e.params.group} ${e.requestId}`.toLowerCase();
          } else if (isGin(e)) {
            haystack = `${e.path} ${e.ip} ${e.method} ${e.requestId}`.toLowerCase();
          } else if (isError(e)) {
            haystack = `${e.message} ${e.requestId}`.toLowerCase();
          } else {
            haystack = `${e.message} ${'requestId' in e ? e.requestId : ''}`.toLowerCase();
          }
          if (!haystack.includes(q)) continue;
        }

      if (matchCount >= offset && results.length < limit) {
        results.push(e);
      }
      matchCount++;
    }

    return { total: matchCount, data: results };
  }

  searchLogs(filter: LogSearchFilter): { total: number; data: ParsedLogEntry[] } {
    const limit = filter.limit ?? 50;
    const offset = filter.offset ?? 0;
    const results: ConsumeLogEntry[] = [];
    let matchCount = 0;

    for (let i = this.consumeEntries.length - 1; i >= 0; i--) {
      const e = this.consumeEntries[i];
      const ts = e.timestamp.getTime();

      // Entries are ingested in (mostly) chronological order, so scanning
      // backwards allows early exit once timestamps fall below the range.
      // 60s tolerance guards against minor out-of-order ingest at rotation.
      if (filter.start !== undefined && ts < filter.start - 60_000) break;

      // Time range filter
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

  getDailyQuota(date: string): number {
    return this.dailyCost.get(date)?.quota ?? 0;
  }

  getTokenTotals(): Array<{ name: string; quota: number; requests: number }> {
    return this.indexes.token.toQuotaTotals();
  }
}
