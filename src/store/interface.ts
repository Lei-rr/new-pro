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

  /** Entry counts */
  getEntryCount(): number;
  getConsumeCount(): number;
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
