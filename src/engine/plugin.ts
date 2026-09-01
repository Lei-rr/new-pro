import type { ParsedLogEntry } from '../types/log.js';
import type { Alert } from '../types/stats.js';
import type { IStore } from '../store/interface.js';

/**
 * Analysis plugin interface.
 * Each plugin observes log entries and can produce alerts.
 * New analysis dimensions are added by implementing this interface.
 */
export interface AnalysisPlugin {
  /** Unique plugin name */
  readonly name: string;

  /** Optional: process a single entry */
  ingest?(entry: ParsedLogEntry): void;

  /** Return current alerts (if any) */
  checkAlerts(): Alert[];

  /** Return a summary for API/WS consumers */
  getSummary(): Record<string, unknown>;

  /**
   * Optional: receive the store as the single source of truth for
   * aggregations, so plugins do not maintain duplicate counters.
   * Called by AnalysisEngine when a store is available.
   */
  bindStore?(store: IStore): void;

  /** Optional: reset state (for testing) */
  reset?(): void;
}
