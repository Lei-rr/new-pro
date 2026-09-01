import EventEmitter from 'eventemitter3';
import type { ParsedLogEntry } from '../types/log.js';
import type { Alert } from '../types/stats.js';

/**
 * Centralized event type map — the EventBus is strongly typed against it.
 */
export interface AppEvents {
  /** Single parsed log entry ingested */
  'log:entry': [entry: ParsedLogEntry];

  /** Batch of entries ingested (history load or file read) */
  'log:batch': [entries: ParsedLogEntry[]];

  /** Alert newly fired (deduped by AnalysisEngine) */
  'alert:fired': [alert: Alert];
}

/**
 * Type-safe event bus using eventemitter3.
 * Plain class (no singleton): constructed once in bootstrap and injected
 * into watcher, engine and ws hub so wiring stays explicit and testable.
 */
export class EventBus extends EventEmitter<AppEvents> {}
