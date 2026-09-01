import type { ParsedLogEntry } from '../types/log.js';
import type { DimensionType, DimensionStats, DimensionQuery, TimelineBucket, OverviewSummary, CostTrendPoint } from '../types/stats.js';

/**
 * Abstract storage interface.
 * Current implementation: MemoryStore.
 * Future: could be backed by SQLite, ClickHouse, etc.
 */
export interface IStore {
  /** Ingest a single entry */
  append(entry: ParsedLogEntry): void;

  /** Bulk ingest (optimized path for history loading) */
  appendBatch(entries: ParsedLogEntry[]): void;

  /** Overall summary. Optional [start, end] epoch ms range. */
  getSummary(start?: number, end?: number): OverviewSummary;

  /** Hourly timeline for the last N hours */
  getTimeline(hours: number): TimelineBucket[];

  /** Dimension analysis with pagination */
  getDimensionStats(
    dimension: DimensionType,
    query?: DimensionQuery,
  ): { total: number; data: DimensionStats[] };

  /** Daily cost trend */
  getCostTrend(days: number): CostTrendPoint[];

  /** Recent consume entries (for log viewer), paginated */
  getRecentConsumeLogs(limit: number, offset?: number): { total: number; data: ParsedLogEntry[] };

  /** Search consume entries, paginated */
  searchLogs(filter: LogSearchFilter): { total: number; data: ParsedLogEntry[] };

  /**
   * Raw log stream (every parsed line: GIN/consume/ERR/INFO/SYS),
   * newest-first, optionally filtered by level/status. No dedup.
   */
  getRawLogs(filter: RawLogFilter): { total: number; data: ParsedLogEntry[] };

  /** Entry counts */
  getEntryCount(): number;
  getConsumeCount(): number;

  /** Daily quota for a date key (YYYY-MM-DD) from the daily aggregation. */
  getDailyQuota(date: string): number;

  /** Per-token quota/request totals from the token dimension index. */
  getTokenTotals(): Array<{ name: string; quota: number; requests: number }>;
}

export interface LogSearchFilter {
  q?: string;
  model?: string;
  user?: string;
  channel?: string;
  ip?: string;
  start?: number;
  end?: number;
  limit?: number;
  offset?: number;
}

export interface RawLogFilter {
  /** 'all' | 'consume' | 'gin' | 'error' | 'sys' | 'success' | 'failure' */
  kind?: 'all' | 'consume' | 'gin' | 'error' | 'sys' | 'success' | 'failure';
  q?: string;
  start?: number;
  end?: number;
  limit?: number;
  offset?: number;
}
