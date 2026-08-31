import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import type { Lifecycle } from '../core/container.js';
import { createLogger } from '../core/logger.js';
import { EventBus } from '../core/event-bus.js';
import { getEnv } from '../env.js';
import type { IStore } from '../store/interface.js';
import type { AnalysisEngine } from '../engine/registry.js';
import { requireWsAuth } from '../api/auth.js';
import type { ParsedLogEntry } from '../types/log.js';
import { isConsume } from '../types/log.js';

const log = createLogger('ws');

/** Upper bound for the pending log buffer (protects against ingest bursts). */
const MAX_BUFFERED_LOGS = 5000;

interface WsClient {
  socket: WebSocket;
  filters?: {
    models?: string[];
    channels?: number[];
    users?: number[];
  };
}

/**
 * WebSocket hub for real-time data push.
 * Manages client connections, filtering, and periodic broadcasts.
 */
export class WsHub implements Lifecycle {
  private clients = new Set<WsClient>();
  private logBuffer: ParsedLogEntry[] = [];
  private statsTimer: ReturnType<typeof setInterval> | null = null;
  private logsTimer: ReturnType<typeof setInterval> | null = null;
  private bus: EventBus;

  constructor(
    private store: IStore,
    private engine: AnalysisEngine,
    bus?: EventBus,
  ) {
    this.bus = bus ?? EventBus.getInstance();
  }

  // Bound handler so on/off reference equality holds
  private onEntry = (entry: ParsedLogEntry): void => {
    if (this.clients.size === 0) return; // no consumers, skip buffering
    this.logBuffer.push(entry);
    if (this.logBuffer.length > MAX_BUFFERED_LOGS) {
      this.logBuffer.splice(0, this.logBuffer.length - MAX_BUFFERED_LOGS);
    }
  };

  /** Register the /ws route on Fastify */
  registerRoute(app: FastifyInstance): void {
    app.get('/ws', { websocket: true, preValidation: requireWsAuth }, (socket, _request) => {
      const client: WsClient = { socket };
      this.clients.add(client);

      log.info({ clients: this.clients.size }, 'WebSocket client connected');

      // Send initial snapshot
      this.send(client, {
        type: 'snapshot',
        data: {
          summary: this.store.getSummary(),
          plugins: this.engine.getAllSummaries(),
          alerts: this.engine.checkAlerts(),
        },
      });

      // Handle client messages
      socket.on('message', (raw: unknown) => {
        try {
          const msg = JSON.parse(String(raw));
          if (msg.type === 'filter' && msg.data) {
            client.filters = msg.data;
          }
        } catch {
          // Ignore invalid messages
        }
      });

      socket.on('close', () => {
        this.clients.delete(client);
        log.debug({ clients: this.clients.size }, 'WebSocket client disconnected');
      });

      socket.on('error', () => {
        this.clients.delete(client);
      });
    });
  }

  // ─── Lifecycle ───

  async start(): Promise<void> {
    const env = getEnv();

    // Listen for new entries
    this.bus.on('log:entry', this.onEntry);

    // Periodic stats broadcast + alert push
    this.statsTimer = setInterval(() => {
      // Newly fired alerts (deduped by the engine) as dedicated messages
      for (const alert of this.engine.pollFiredAlerts()) {
        this.broadcast({ type: 'alert', data: alert });
      }

      this.broadcast({
        type: 'stats_update',
        data: {
          summary: this.store.getSummary(),
          alerts: this.engine.checkAlerts(),
        },
      });
    }, env.WS_STATS_INTERVAL_MS);

    // Periodic log batch flush
    this.logsTimer = setInterval(() => {
      this.flushLogBuffer();
    }, env.WS_LOGS_BATCH_MS);

    log.info('WebSocket hub started');
  }

  async stop(): Promise<void> {
    if (this.statsTimer) clearInterval(this.statsTimer);
    if (this.logsTimer) clearInterval(this.logsTimer);
    this.statsTimer = null;
    this.logsTimer = null;

    this.bus.off('log:entry', this.onEntry);

    for (const client of this.clients) {
      client.socket.close();
    }
    this.clients.clear();

    log.info('WebSocket hub stopped');
  }

  // ─── Private ───

  private flushLogBuffer(): void {
    if (this.logBuffer.length === 0) return;
    if (this.clients.size === 0) {
      this.logBuffer.length = 0;
      return;
    }

    const env = getEnv();
    const batch = this.logBuffer.splice(0, env.WS_LOGS_BATCH_SIZE);

    for (const client of this.clients) {
      const filtered = this.applyFilters(batch, client.filters);
      if (filtered.length > 0) {
        this.send(client, { type: 'new_logs', data: filtered });
      }
    }
  }

  private applyFilters(
    entries: ParsedLogEntry[],
    filters?: WsClient['filters'],
  ): ParsedLogEntry[] {
    if (!filters) return entries;

    return entries.filter(entry => {
      if (!isConsume(entry)) return true;
      if (filters.models?.length && !filters.models.includes(entry.params.model_name)) return false;
      if (filters.channels?.length && !filters.channels.includes(entry.params.channel_id)) return false;
      if (filters.users?.length && !filters.users.includes(entry.userId)) return false;
      return true;
    });
  }

  private broadcast(message: { type: string; data: unknown }): void {
    for (const client of this.clients) {
      this.send(client, message);
    }
  }

  private send(client: WsClient, message: { type: string; data: unknown }): void {
    if (client.socket.readyState !== 1) { // OPEN
      this.clients.delete(client);
      return;
    }
    try {
      client.socket.send(JSON.stringify(message));
    } catch {
      this.clients.delete(client);
    }
  }
}
