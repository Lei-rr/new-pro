import type { ParsedLogEntry } from './log.js';
import type { Alert } from './stats.js';

/**
 * Centralized event type map.
 * EventBus is strongly typed against this interface.
 */
export interface AppEvents {
  /** Single parsed log entry ingested */
  'log:entry': [entry: ParsedLogEntry];

  /** Batch of entries ingested (history load or file read) */
  'log:batch': [entries: ParsedLogEntry[]];

  /** Alert newly fired (deduped by AnalysisEngine) */
  'alert:fired': [alert: Alert];
}
