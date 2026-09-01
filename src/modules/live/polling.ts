import type { Lifecycle } from '../../core/lifecycle.js';
import { createLogger } from '../../core/logger.js';
import { loadConfig } from '../../config/env.js';
import type { LogsRepository } from '../logs/logs.repo.js';
import type { LogRow } from '../logs/logs.types.js';

const log = createLogger('polling');

/**
 * 增量轮询器：主键游标（id > cursor）拉取新记录。
 * 压力≈0（主键索引扫描），仅服务日志流推送。
 */
export class LivePoller implements Lifecycle {
  private timer: ReturnType<typeof setInterval> | null = null;
  private cursor = 0;
  private listeners = new Set<(rows: LogRow[]) => void>();

  constructor(private repo: LogsRepository) {}

  onNew(cb: (rows: LogRow[]) => void): void {
    this.listeners.add(cb);
  }

  async start(): Promise<void> {
    this.cursor = await this.repo.maxId();
    log.info({ cursor: this.cursor }, 'Live polling started');
    this.timer = setInterval(() => void this.tick(), loadConfig().POLL_INTERVAL_MS);
    this.timer.unref();
  }

  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    log.info('Live polling stopped');
  }

  private async tick(): Promise<void> {
    try {
      const rows = await this.repo.sinceId(this.cursor, 500);
      if (rows.length > 0) {
        this.cursor = Number(rows[rows.length - 1].id);
        for (const fn of this.listeners) fn(rows);
      }
    } catch (err) {
      log.warn({ err }, 'Polling tick failed');
    }
  }
}
