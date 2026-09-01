import type { ConsumeLogEntry } from '../types/log.js';
import type { DimensionStats, DimensionQuery } from '../types/stats.js';
import { QUOTA_PER_COST_UNIT } from '../constants.js';
import { getIpLocation } from '../utils/geo.js';

/**
 * Accumulator for a single dimension key.
 * Shared structure used by all dimension indexes.
 */
interface DimAccum {
  requests: number;
  promptTokens: number;
  completionTokens: number;
  quota: number;
  errors: number;
  cacheTokens: number;
  totalTime: number;
  totalFrt: number;
  frtCount: number;
  firstSeen: number;
  lastSeen: number;
}

function newAccum(ts: number): DimAccum {
  return {
    requests: 0,
    promptTokens: 0,
    completionTokens: 0,
    quota: 0,
    errors: 0,
    cacheTokens: 0,
    totalTime: 0,
    totalFrt: 0,
    frtCount: 0,
    firstSeen: ts,
    lastSeen: ts,
  };
}

function accumToStats(key: string, a: DimAccum): DimensionStats {
  const isIp = key.includes('.') || key.includes(':');
  return {
    key,
    requests: a.requests,
    promptTokens: a.promptTokens,
    completionTokens: a.completionTokens,
    totalTokens: a.promptTokens + a.completionTokens,
    quota: a.quota,
    cost: a.quota / QUOTA_PER_COST_UNIT,
    errors: a.errors,
    avgResponseTime: a.requests > 0 ? a.totalTime / a.requests : 0,
    avgFrt: a.frtCount > 0 ? a.totalFrt / a.frtCount : 0,
    cacheTokens: a.cacheTokens,
    location: isIp ? getIpLocation(key) : undefined,
    firstSeen: a.firstSeen,
    lastSeen: a.lastSeen,
  };
}

const SORT_FNS: Record<string, (a: DimensionStats, b: DimensionStats) => number> = {
  requests: (a, b) => b.requests - a.requests,
  tokens:   (a, b) => b.totalTokens - a.totalTokens,
  quota:    (a, b) => b.quota - a.quota,
  cost:     (a, b) => b.cost - a.cost,
  errors:   (a, b) => b.errors - a.errors,
  frt:      (a, b) => b.avgFrt - a.avgFrt,
};

/**
 * Generic multi-dimension index.
 * Maintains per-key accumulators that can be queried as DimensionStats.
 */
export class DimensionIndex {
  private data = new Map<string, DimAccum>();

  /** Ingest a consume entry for a given dimension key */
  ingest(key: string, entry: ConsumeLogEntry): void {
    if (!key) return;
    const ts = entry.timestamp.getTime();
    let acc = this.data.get(key);
    if (!acc) {
      acc = newAccum(ts);
      this.data.set(key, acc);
    }

    const p = entry.params;
    acc.requests++;
    acc.promptTokens += p.prompt_tokens;
    acc.completionTokens += p.completion_tokens;
    acc.quota += p.quota;
    acc.totalTime += p.use_time_seconds;
    acc.cacheTokens += p.other?.cache_tokens ?? 0;

    const frt = p.other?.frt ?? -1;
    if (frt > 0) {
      acc.totalFrt += frt;
      acc.frtCount++;
    }

    if (ts < acc.firstSeen) acc.firstSeen = ts;
    if (ts > acc.lastSeen) acc.lastSeen = ts;
  }

  /**
   * Attach consume details (tokens/quota) to a raw request record without
   * counting a second request. For the IP dimension the request count and
   * response time come from ingestIpRequest (GIN), so each relay request
   * is counted exactly once.
   */
  addConsumeParams(key: string, entry: ConsumeLogEntry): void {
    if (!key) return;
    const ts = entry.timestamp.getTime();
    let acc = this.data.get(key);
    if (!acc) {
      acc = newAccum(ts);
      this.data.set(key, acc);
    }

    const p = entry.params;
    acc.promptTokens += p.prompt_tokens;
    acc.completionTokens += p.completion_tokens;
    acc.quota += p.quota;
    acc.cacheTokens += p.other?.cache_tokens ?? 0;

    const frt = p.other?.frt ?? -1;
    if (frt > 0) {
      acc.totalFrt += frt;
      acc.frtCount++;
    }

    if (ts < acc.firstSeen) acc.firstSeen = ts;
    if (ts > acc.lastSeen) acc.lastSeen = ts;
  }

  /** Number of distinct keys active within [startMs, endMs]. */
  countActiveInRange(startMs: number, endMs: number): number {
    let count = 0;
    for (const acc of this.data.values()) {
      if (acc.lastSeen >= startMs && acc.firstSeen <= endMs) count++;
    }
    return count;
  }

  /** Increment error count for a key */
  addError(key: string, ts: number): void {
    if (!key) return;
    let acc = this.data.get(key);
    if (!acc) {
      acc = newAccum(ts);
      this.data.set(key, acc);
    }
    acc.errors++;
    if (ts > acc.lastSeen) acc.lastSeen = ts;
  }

  /**
   * Record a raw HTTP request (GIN relay) against a key. This is the single
   * source of the request count and response time (GIN duration). Consume
   * params attach later via addConsumeParams without re-counting.
   */
  ingestIpRequest(key: string, durationMs: number, ts: number): void {
    if (!key) return;
    let acc = this.data.get(key);
    if (!acc) {
      acc = newAccum(ts);
      this.data.set(key, acc);
    }
    acc.requests++;
    acc.totalTime += durationMs / 1000;
    if (ts < acc.firstSeen) acc.firstSeen = ts;
    if (ts > acc.lastSeen) acc.lastSeen = ts;
  }

  /** Remove accumulators inactive since cutoffMs (retention cleanup). */
  pruneBefore(cutoffMs: number): void {
    for (const [key, acc] of this.data) {
      if (acc.lastSeen < cutoffMs) this.data.delete(key);
    }
  }

  /** Query stats with sort, time-range and offset/limit pagination */
  query(q?: DimensionQuery): { total: number; data: DimensionStats[] } {
    const stats: DimensionStats[] = [];
    for (const [key, acc] of this.data) {
      // Time range filter
      if (q?.start && acc.lastSeen < q.start) continue;
      if (q?.end && acc.firstSeen > q.end) continue;
      stats.push(accumToStats(key, acc));
    }

    const sortFn = SORT_FNS[q?.sort ?? 'requests'] ?? SORT_FNS.requests;
    stats.sort(sortFn);

    const total = stats.length;
    const offset = q?.offset ?? 0;
    const limit = q?.limit ?? 100;
    return {
      total,
      data: stats.slice(offset, offset + limit),
    };
  }

  /** Total unique keys */
  get size(): number {
    return this.data.size;
  }

  /** Raw per-key quota/request totals (for alert rules that scan all keys). */
  toQuotaTotals(): Array<{ name: string; quota: number; requests: number }> {
    const out: Array<{ name: string; quota: number; requests: number }> = [];
    for (const [key, acc] of this.data) {
      out.push({ name: key, quota: acc.quota, requests: acc.requests });
    }
    return out;
  }
}
