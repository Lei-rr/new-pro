import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import type { Lifecycle } from '../../core/lifecycle.js';
import { createLogger } from '../../core/logger.js';
import { requireWsAuth } from '../../api/auth.js';
import type { LivePoller } from './polling.js';
import type { LogsService } from '../logs/logs.service.js';
import type { LogEntryDto } from '../logs/logs.types.js';

const log = createLogger('ws');

interface WsClient {
  socket: WebSocket;
}

/**
 * WebSocket hub：仅推送实时日志流（快照/统计走 REST 点击查询）。
 * 增量行来自 LivePoller，缓冲后批量冲刷。
 */
export class WsHub implements Lifecycle {
  private clients = new Set<WsClient>();
  private buffer: LogEntryDto[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private logs: LogsService,
    poller: LivePoller,
  ) {
    poller.onNew((rows) => {
      this.buffer.push(...this.logs.toDtos(rows));
      if (this.buffer.length > 5000) {
        this.buffer.splice(0, this.buffer.length - 5000);
      }
    });
  }

  registerRoute(app: FastifyInstance): void {
    app.get('/ws', { websocket: true, preValidation: requireWsAuth }, (socket) => {
      const client: WsClient = { socket };
      this.clients.add(client);

      socket.on('close', () => {
        this.clients.delete(client);
        log.debug({ clients: this.clients.size }, 'WS client disconnected');
      });
      socket.on('error', () => this.clients.delete(client));
    });
  }

  async start(): Promise<void> {
    this.flushTimer = setInterval(() => this.flush(), 500);
    log.info('WebSocket hub started');
  }

  async stop(): Promise<void> {
    if (this.flushTimer) clearInterval(this.flushTimer);
    this.flushTimer = null;
    for (const client of this.clients) client.socket.close();
    this.clients.clear();
    log.info('WebSocket hub stopped');
  }

  private flush(): void {
    if (this.buffer.length === 0) return;
    if (this.clients.size === 0) {
      this.buffer.length = 0;
      return;
    }
    const batch = this.buffer.splice(0, 50);
    for (const client of this.clients) {
      if (client.socket.readyState !== 1) {
        this.clients.delete(client);
        continue;
      }
      try {
        client.socket.send(JSON.stringify({ type: 'new_logs', data: batch }));
      } catch {
        this.clients.delete(client);
      }
    }
  }
}
