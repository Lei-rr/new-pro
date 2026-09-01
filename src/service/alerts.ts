import type { Lifecycle } from '../core/container.js';
import { createLogger } from '../core/logger.js';
import { getEnv } from '../env.js';
import { QUOTA_PER_COST_UNIT } from '../constants.js';
import { toDateString } from '../utils/time.js';
import type { PgStore } from '../db/pg-store.js';
import type { LogDto } from '../service/analytics.js';
import type { Alert } from '../types/stats.js';

const log = createLogger('alerts');

/** 告警规则引擎：消费增量日志，产出告警（PG 数据源，无 IP 规则） */
export class AlertEngine implements Lifecycle {
  private clientGoneTimes: number[] = [];
  private dailyQuota = new Map<string, number>();
  private tokenQuota = new Map<string, number>();
  private recentErrors: number[] = [];

  constructor(private pg: PgStore) {}

  ingest(rows: LogDto[]): void {
    const now = Date.now();
    for (const r of rows) {
      if (r.type === 5) this.recentErrors.push(r.timestamp);
      if (r.type === 2) {
        const dk = toDateString(new Date(r.timestamp), getEnv().LOG_TZ);
        this.dailyQuota.set(dk, (this.dailyQuota.get(dk) ?? 0) + r.quota);
        if (r.tokenName) {
          this.tokenQuota.set(r.tokenName, (this.tokenQuota.get(r.tokenName) ?? 0) + r.quota);
        }
      }
    }
    // 剪枝：错误窗口 5 分钟、clientGone 1 小时
    const errCutoff = now - 5 * 60_000;
    this.recentErrors = this.recentErrors.filter((t) => t > errCutoff);
    const goneCutoff = now - 60 * 60_000;
    this.clientGoneTimes = this.clientGoneTimes.filter((t) => t > goneCutoff);
  }

  checkAlerts(): Alert[] {
    const now = Date.now();
    const alerts: Alert[] = [];

    // 2. 今日消费
    const today = toDateString(new Date(), getEnv().LOG_TZ);
    const todayQuota = this.dailyQuota.get(today) ?? 0;
    const quotaThreshold = getEnv().ALERT_QUOTA_THRESHOLD;
    if (todayQuota > quotaThreshold) {
      alerts.push({
        id: `cost-daily-${today}`,
        ruleId: 'cost-high-daily',
        severity: todayQuota > quotaThreshold * 2 ? 'critical' : 'warning',
        message: `今日消费 $${(todayQuota / QUOTA_PER_COST_UNIT).toFixed(2)}（阈值 $${(quotaThreshold / QUOTA_PER_COST_UNIT).toFixed(2)}）`,
        timestamp: now,
        details: { date: today, quota: todayQuota, cost: todayQuota / QUOTA_PER_COST_UNIT },
      });
    }

    // 3. 单令牌高消费
    for (const [name, quota] of this.tokenQuota) {
      if (quota > quotaThreshold) {
        alerts.push({
          id: `token-quota-${name}`,
          ruleId: 'token-high-quota',
          severity: 'warning',
          message: `令牌「${name}」累计消耗 $${(quota / QUOTA_PER_COST_UNIT).toFixed(2)}`,
          timestamp: now,
          details: { token: name, quota, cost: quota / QUOTA_PER_COST_UNIT },
        });
      }
    }

    return alerts;
  }

  /** 启动时从 PG 加载历史累计值（今日消费、令牌累计、近期错误） */
  async hydrate(): Promise<void> {
    const tz = getEnv().LOG_TZ;
    const today = toDateString(new Date(), tz);
    const todayStart = new Date(`${today}T00:00:00`).getTime();
    const startSec = Math.floor(todayStart / 1000);

    const res = await this.pg.query<{ token_name: string; quota: string }>(
      `SELECT token_name, SUM(quota)::bigint AS quota FROM logs
       WHERE type = 2 AND created_at >= $1 AND token_name <> ''
       GROUP BY token_name`,
      [startSec],
    );
    for (const r of res.rows) {
      this.tokenQuota.set(r.token_name, Number(r.quota));
      this.dailyQuota.set(today, (this.dailyQuota.get(today) ?? 0) + Number(r.quota));
    }

    const errRes = await this.pg.query<{ count: string }>(
      `SELECT COUNT(*)::bigint AS count FROM logs
       WHERE type = 5 AND created_at >= $1`,
      [Math.floor((Date.now() - 5 * 60_000) / 1000)],
    );
    const errCount = Number(errRes.rows[0]?.count ?? 0);
    this.recentErrors = new Array(Math.min(errCount, 500)).fill(Date.now());

    log.info({ tokenCount: this.tokenQuota.size, todayQuota: this.dailyQuota.get(today) ?? 0 }, 'Alert engine hydrated');
  }

  async start(): Promise<void> {
    await this.hydrate();
    log.info('Alert engine started');
  }

  async stop(): Promise<void> {
    log.info('Alert engine stopped');
  }
}
