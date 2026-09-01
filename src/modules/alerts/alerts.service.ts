import { loadConfig } from '../../config/env.js';
import { startOfDayMs } from '../../shared/time.js';
import { QUOTA_PER_COST_UNIT } from '../../shared/constants.js';
import type { Database } from '../../core/db.js';
import type { Alert } from './alerts.types.js';

/**
 * 告警服务：全部规则基于真实 SQL 查询（无内存累计、无伪造数据）。
 * 每次 check() 实时聚合，天然与 PG 数据一致。
 */
export class AlertsService {
  constructor(private db: Database) {}

  async check(): Promise<Alert[]> {
    const config = loadConfig();
    const now = Date.now();
    const todayStart = startOfDayMs(now, config.LOG_TZ);
    const alerts: Alert[] = [];

    // 1. 今日消费阈值
    const todayQuota = await this.dailyQuota(Math.floor(todayStart / 1000));
    const quotaThreshold = config.ALERT_QUOTA_THRESHOLD;
    if (todayQuota > quotaThreshold) {
      alerts.push({
        id: `cost-daily-${Math.floor(todayStart / 86_400_000)}`,
        ruleId: 'cost-high-daily',
        severity: todayQuota > quotaThreshold * 2 ? 'critical' : 'warning',
        message: `今日消费 $${(todayQuota / QUOTA_PER_COST_UNIT).toFixed(2)}（阈值 $${(quotaThreshold / QUOTA_PER_COST_UNIT).toFixed(2)}）`,
        timestamp: now,
        details: { quota: todayQuota, cost: todayQuota / QUOTA_PER_COST_UNIT },
      });
    }

    // 2. 错误率（5 分钟窗口：type=5 / type=2）
    const fiveMinSec = Math.floor((now - 5 * 60_000) / 1000);
    const [errors, consumes] = await Promise.all([
      this.countByType(5, fiveMinSec),
      this.countByType(2, fiveMinSec),
    ]);
    if (consumes >= 10 && errors / consumes > config.ALERT_ERROR_RATE) {
      alerts.push({
        id: 'error-rate-high',
        ruleId: 'error-rate',
        severity: errors / consumes > config.ALERT_ERROR_RATE * 2 ? 'critical' : 'warning',
        message: `近 5 分钟错误率 ${((errors / consumes) * 100).toFixed(1)}%（${errors}/${consumes}）`,
        timestamp: now,
        details: { errors, consumes, rate: errors / consumes },
      });
    }

    return alerts;
  }

  private async dailyQuota(startSec: number): Promise<number> {
    const res = await this.db.query<{ quota: string }>(
      `SELECT COALESCE(SUM(quota), 0)::bigint AS quota FROM logs
       WHERE type = 2 AND created_at >= $1`,
      [startSec],
    );
    return Number(res.rows[0]?.quota ?? 0);
  }

  private async countByType(type: number, startSec: number): Promise<number> {
    const res = await this.db.query<{ count: string }>(
      `SELECT COUNT(*)::bigint AS count FROM logs
       WHERE type = $1 AND created_at >= $2`,
      [type, startSec],
    );
    return Number(res.rows[0]?.count ?? 0);
  }
}
