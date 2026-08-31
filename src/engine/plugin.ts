import type { ParsedLogEntry } from '../types/log.js';
import type { Alert } from '../types/stats.js';

/**
 * Analysis plugin interface.
 * Each plugin observes log entries and can produce alerts.
 * New analysis dimensions are added by implementing this interface.
 */
export interface AnalysisPlugin {
  /** Unique plugin name */
  readonly name: string;

  /** Process a single entry */
  ingest(entry: ParsedLogEntry): void;

  /** Return current alerts (if any) */
  checkAlerts(): Alert[];

  /** Return a summary for API/WS consumers */
  getSummary(): Record<string, unknown>;

  /** Optional: reset state (for testing) */
  reset?(): void;
}
