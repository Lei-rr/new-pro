import type { Lifecycle } from '../core/container.js';
import { createLogger } from '../core/logger.js';
import { EventBus } from '../core/event-bus.js';
import type { AnalysisPlugin } from './plugin.js';
import type { ParsedLogEntry } from '../types/log.js';
import type { Alert } from '../types/stats.js';

const log = createLogger('engine');

/** Minimum interval between repeated emissions of the same alert. */
const ALERT_COOLDOWN_MS = 60_000;

/**
 * Plugin registry and event wiring.
 * Listens to EventBus for log entries and fans out to all plugins.
 */
export class AnalysisEngine implements Lifecycle {
  private plugins = new Map<string, AnalysisPlugin>();
  private bus: EventBus;
  private lastFired = new Map<string, number>();

  // Bound handlers so on/off reference equality holds
  private onEntry = (entry: ParsedLogEntry): void => {
    this.ingest(entry);
  };

  private onBatch = (entries: ParsedLogEntry[]): void => {
    this.ingestBatch(entries);
  };

  constructor(bus?: EventBus) {
    this.bus = bus ?? EventBus.getInstance();
  }

  /** Register a plugin. Call before start(). */
  use(plugin: AnalysisPlugin): this {
    if (this.plugins.has(plugin.name)) {
      log.warn({ plugin: plugin.name }, 'Plugin already registered, overwriting');
    }
    this.plugins.set(plugin.name, plugin);
    return this;
  }

  /** Get a specific plugin */
  getPlugin<T extends AnalysisPlugin>(name: string): T | undefined {
    return this.plugins.get(name) as T | undefined;
  }

  /** Get all registered plugin names */
  getPluginNames(): string[] {
    return [...this.plugins.keys()];
  }

  /** Feed a single entry to all plugins */
  ingest(entry: ParsedLogEntry): void {
    for (const plugin of this.plugins.values()) {
      try {
        plugin.ingest(entry);
      } catch (err) {
        log.error({ err, plugin: plugin.name }, 'Plugin ingest failed');
      }
    }
  }

  /** Feed a batch to all plugins */
  ingestBatch(entries: ParsedLogEntry[]): void {
    for (let i = 0; i < entries.length; i++) {
      this.ingest(entries[i]);
    }
  }

  /** Collect current alerts from all plugins (idempotent, no side effects). */
  checkAlerts(): Alert[] {
    const alerts: Alert[] = [];
    for (const plugin of this.plugins.values()) {
      try {
        const pluginAlerts = plugin.checkAlerts();
        for (const alert of pluginAlerts) alerts.push(alert);
      } catch (err) {
        log.error({ err, plugin: plugin.name }, 'Plugin checkAlerts failed');
      }
    }
    return alerts;
  }

  /**
   * Poll current alerts and return only newly-fired ones (dedup by id + cooldown).
   * Emits `alert:fired` on the EventBus for each newly fired alert.
   */
  pollFiredAlerts(): Alert[] {
    const now = Date.now();
    const fired: Alert[] = [];

    for (const alert of this.checkAlerts()) {
      const last = this.lastFired.get(alert.id);
      if (last === undefined || now - last >= ALERT_COOLDOWN_MS) {
        this.lastFired.set(alert.id, now);
        fired.push(alert);
        this.bus.emit('alert:fired', alert);
      }
    }

    // Prune stale dedup state
    for (const [id, ts] of this.lastFired) {
      if (now - ts > ALERT_COOLDOWN_MS * 20) this.lastFired.delete(id);
    }

    return fired;
  }

  /** Collect summaries from all plugins */
  getAllSummaries(): Record<string, Record<string, unknown>> {
    const result: Record<string, Record<string, unknown>> = {};
    for (const [name, plugin] of this.plugins) {
      try {
        result[name] = plugin.getSummary();
      } catch (err) {
        log.error({ err, plugin: name }, 'Plugin getSummary failed');
        result[name] = {};
      }
    }
    return result;
  }

  // ─── Lifecycle ───

  async start(): Promise<void> {
    this.bus.on('log:entry', this.onEntry);
    this.bus.on('log:batch', this.onBatch);

    log.info(
      { plugins: [...this.plugins.keys()] },
      'Analysis engine started with %d plugins',
      this.plugins.size,
    );
  }

  async stop(): Promise<void> {
    this.bus.off('log:entry', this.onEntry);
    this.bus.off('log:batch', this.onBatch);
    log.info('Analysis engine stopped');
  }
}
