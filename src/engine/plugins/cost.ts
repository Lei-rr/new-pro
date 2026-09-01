import type { AnalysisPlugin } from '../plugin.js';
import type { Alert } from '../../types/stats.js';
import type { IStore } from '../../store/interface.js';
import { getEnv } from '../../env.js';
import { QUOTA_PER_COST_UNIT } from '../../constants.js';
import { toDateString } from '../../utils/time.js';

/**
 * Daily cost tracking and high-spend alerting.
 *
 * All aggregation lives in the store (single source of truth); this plugin
 * only evaluates the daily threshold against the store's daily totals.
 */
export class CostPlugin implements AnalysisPlugin {
  readonly name = 'cost';

  private store: IStore | null = null;

  bindStore(store: IStore): void {
    this.store = store;
  }

  checkAlerts(): Alert[] {
    if (!this.store) return [];

    const threshold = getEnv().ALERT_QUOTA_THRESHOLD;
    const alerts: Alert[] = [];
    const today = toDateString(new Date(), getEnv().LOG_TZ);
    const todayQuota = this.store.getDailyQuota(today);

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
    if (!this.store) return {};
    const s = this.store.getSummary();
    const today = toDateString(new Date(), getEnv().LOG_TZ);
    const todayQuota = this.store.getDailyQuota(today);
    return {
      totalQuota: s.totalQuota,
      totalCost: s.totalCost,
      totalRequests: s.billingRequests,
      todayQuota,
      todayCost: todayQuota / QUOTA_PER_COST_UNIT,
      avgCostPerRequest: s.billingRequests > 0 ? s.totalCost / s.billingRequests : 0,
    };
  }
}
