import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import { z } from 'zod';
import type { Lifecycle } from '../core/container.js';
import { createLogger } from '../core/logger.js';
import { getEnv } from '../env.js';
import { startOfDayMs } from '../utils/time.js';
import { requireWsAuth } from '../api/auth.js';
import type { AnalyticsService, LogDto, OverviewSummaryDto } from '../service/analytics.js';
import type { AlertEngine } from '../service/alerts.js';
import type { PgPolling } from '../db/polling.js';

const log = createLogger('ws');

/** 客户端窗口（自然日）消息 schema */
const wsRangeSchema = z.object({
  rangeDays: z.number().int().min(1).max(90).optional(),
});

interface WsClient {
  socket: WebSocket;
  rangeDays?: number;
}

/**
 * WebSocket hub：PG 增量轮询 → 实时推送。
 * 快照 + 周期统计 + 新日志 + 告警。
 */
export class WsHub implements Lifecycle {
  private clients = new Set<WsClient>();
  private statsTimer: ReturnType<typeof setInterval> | null = null;
  private logBuffer: LogDto[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private analytics: AnalyticsService,
    private alerts: AlertEngine,
    private polling: PgPolling,
  ) {
    // 轮询新行 → 缓冲 → 周期性冲刷给客户端
    this.polling.onNew((rows) => {
      const dtos = this.analytics.toLogDtos(rows);
      this.logBuffer.push(...dtos);
      if (this.logBuffer.length > 5000) {
        this.logBuffer.splice(0, this.logBuffer.length - 5000);
      }
    });
  }

  registerRoute(app: FastifyInstance): void {
    app.get('/ws', { websocket: true, preValidation: requireWsAuth }, (socket, _request) => {
      const client: WsClient = { socket };
      this.clients.add(client);

      // 初始快照
      void this.sendSnapshot(client);

      socket.on('message', (raw: unknown) => {
        try {
          const msg = JSON.parse(String(raw)) as { type?: string; data?: unknown };
          if (msg.type === 'range' && msg.data) {
            const parsed = wsRangeSchema.safeParse(msg.data);
            if (parsed.success && parsed.data.rangeDays !== undefined) {
              client.rangeDays = parsed.data.rangeDays;
            }
          }
        } catch {
          /* ignore */
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

  async start(): Promise<void> {
    const env = getEnv();

    // 周期统计推送（每 3s：summary + 告警）
    this.statsTimer = setInterval(() => {
      void this.broadcastStats();
    }, env.WS_STATS_INTERVAL_MS ?? 3000);

    // 日志缓冲冲刷（每 500ms）
    this.flushTimer = setInterval(() => {
      this.flushLogs();
    }, 500);

    log.info('WebSocket hub started');
  }

  async stop(): Promise<void> {
    if (this.statsTimer) clearInterval(this.statsTimer);
    if (this.flushTimer) clearInterval(this.flushTimer);
    this.statsTimer = null;
    this.flushTimer = null;
    for (const client of this.clients) client.socket.close();
    this.clients.clear();
    log.info('WebSocket hub stopped');
  }

  private async sendSnapshot(client: WsClient): Promise<void> {
    try {
      const summary = await this.analytics.getSummary();
      this.send(client, {
        type: 'snapshot',
        data: {
          summary,
          plugins: {},
          alerts: this.alerts.checkAlerts(),
        },
      });
    } catch (err) {
      log.warn({ err }, 'snapshot failed');
    }
  }

  private async broadcastStats(): Promise<void> {
    if (this.clients.size === 0) return;
    for (const client of this.clients) {
      try {
        const days = client.rangeDays ?? 1;
        const now = Date.now();
        const start = startOfDayMs(now, getEnv().LOG_TZ, days - 1);
        const summary = await this.analytics.getSummary(start, now);
        this.send(client, {
          type: 'stats_update',
          data: {
            summary,
            alerts: this.alerts.checkAlerts(),
          },
        });
      } catch (err) {
        log.warn({ err }, 'stats broadcast failed');
      }
    }
  }

  private flushLogs(): void {
    if (this.logBuffer.length === 0 || this.clients.size === 0) {
      if (this.clients.size === 0) this.logBuffer.length = 0;
      return;
    }
    const batch = this.logBuffer.splice(0, 50);
    for (const client of this.clients) {
      this.send(client, { type: 'new_logs', data: batch });
    }
  }

  private send(client: WsClient, message: unknown): void {
    if (client.socket.readyState !== 1) {
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

export type { OverviewSummaryDto };
