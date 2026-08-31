import type { AnalysisPlugin } from '../plugin.js';
import type { ParsedLogEntry } from '../../types/log.js';
import { isConsume } from '../../types/log.js';
import type { Alert } from '../../types/stats.js';
import { getEnv } from '../../env.js';
import { QUOTA_PER_COST_UNIT, toDateString } from '../../utils/format.js';

/**
 * Daily cost tracking and high-spend alerting.
 */
export class CostPlugin implements AnalysisPlugin {
  readonly name = 'cost';

  private dailyQuota = new Map<string, number>();
  private totalQuota = 0;
  private totalRequests = 0;

  ingest(entry: ParsedLogEntry): void {
    if (!isConsume(entry)) return;

    const date = toDateString(entry.timestamp);
    this.dailyQuota.set(date, (this.dailyQuota.get(date) ?? 0) + entry.params.quota);
    this.totalQuota += entry.params.quota;
    this.totalRequests++;
  }

  checkAlerts(): Alert[] {
    // Prune daily buckets beyond the max query window
    const dayCutoff = toDateString(new Date(Date.now() - 90 * 86_400_000));
    for (const key of this.dailyQuota.keys()) {
      if (key < dayCutoff) this.dailyQuota.delete(key);
    }

    const threshold = getEnv().ALERT_QUOTA_THRESHOLD;
    const alerts: Alert[] = [];
    const today = toDateString(new Date());
    const todayQuota = this.dailyQuota.get(today) ?? 0;

    if (todayQuota > threshold) {
      alerts.push({
        id: `cost-daily-${today}`,
        ruleId: 'cost-high-daily',
        severity: todayQuota > threshold * 2 ? 'critical' : 'warning',
        message: `Today's spending: ${(todayQuota / QUOTA_PER_COST_UNIT).toFixed(2)} (threshold: ${(threshold / QUOTA_PER_COST_UNIT).toFixed(2)})`,
        timestamp: Date.now(),
        details: { date: today, quota: todayQuota, cost: todayQuota / QUOTA_PER_COST_UNIT },
      });
    }

    return alerts;
  }

  getSummary(): Record<string, unknown> {
    const today = toDateString(new Date());
    return {
      totalQuota: this.totalQuota,
      totalCost: this.totalQuota / QUOTA_PER_COST_UNIT,
      totalRequests: this.totalRequests,
      todayQuota: this.dailyQuota.get(today) ?? 0,
      todayCost: (this.dailyQuota.get(today) ?? 0) / QUOTA_PER_COST_UNIT,
      avgCostPerRequest: this.totalRequests > 0
        ? (this.totalQuota / QUOTA_PER_COST_UNIT) / this.totalRequests
        : 0,
    };
  }
}
