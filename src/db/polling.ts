import { EventEmitter } from 'node:events';
import type { Lifecycle } from '../core/container.js';
import { createLogger } from '../core/logger.js';
import { getEnv } from '../env.js';
import type { PgStore, LogRow } from './pg-store.js';

const log = createLogger('polling');

/** 增量轮询器：持续拉取 PG 新记录并推送给实时消费者 */
export class PgPolling implements Lifecycle {
  private timer: ReturnType<typeof setInterval> | null = null;
  private cursor: number;
  private events = new EventEmitter();
  private started = false;

  constructor(private pg: PgStore) {
    this.cursor = 0;
  }

  /** 订阅新记录事件 */
  onNew(cb: (rows: LogRow[]) => void): void {
    this.events.on('new', cb);
  }

  async start(): Promise<void> {
    this.started = true;
    this.cursor = await this.pg.getMaxId();
    log.info({ cursor: this.cursor }, 'PG polling started');
    this.timer = setInterval(() => void this.tick(), getEnv().POLL_INTERVAL_MS);
    this.timer.unref();
  }

  async stop(): Promise<void> {
    this.started = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async tick(): Promise<void> {
    if (!this.started) return;
    try {
      const rows = await this.pg.getNewLogs(this.cursor, 500);
      if (rows.length > 0) {
        this.cursor = Number(rows[rows.length - 1].id);
        this.events.emit('new', rows);
      }
    } catch (err) {
      log.warn({ err }, 'PG polling tick failed');
    }
  }
}
