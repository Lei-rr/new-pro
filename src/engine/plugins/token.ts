import type { AnalysisPlugin } from '../plugin.js';
import type { Alert } from '../../types/stats.js';
import type { IStore } from '../../store/interface.js';
import { getEnv } from '../../env.js';
import { QUOTA_PER_COST_UNIT } from '../../constants.js';

/**
 * Per-token (API key) usage tracking and abuse detection.
 *
 * Token aggregations live in the store's token dimension index; this plugin
 * only evaluates the quota threshold against them.
 */
export class TokenPlugin implements AnalysisPlugin {
  readonly name = 'token';

  private store: IStore | null = null;

  bindStore(store: IStore): void {
    this.store = store;
  }

  checkAlerts(): Alert[] {
    if (!this.store) return [];
    const threshold = getEnv().ALERT_QUOTA_THRESHOLD;
    const alerts: Alert[] = [];

    for (const t of this.store.getTokenTotals()) {
      if (t.quota > threshold) {
        alerts.push({
          id: `token-quota-${t.name}`,
          ruleId: 'token-high-quota',
          severity: 'warning',
          message: `Token "${t.name}" has consumed ${(t.quota / QUOTA_PER_COST_UNIT).toFixed(2)} total quota`,
          timestamp: Date.now(),
          details: { token: t.name, quota: t.quota, cost: t.quota / QUOTA_PER_COST_UNIT },
        });
      }
    }

    return alerts;
  }

  getSummary(): Record<string, unknown> {
    if (!this.store) return {};
    const totals = this.store.getTokenTotals();
    const top = [...totals]
      .sort((a, b) => b.quota - a.quota)
      .slice(0, 10)
      .map((t) => ({
        name: t.name,
        quota: t.quota,
        cost: t.quota / QUOTA_PER_COST_UNIT,
        requests: t.requests,
      }));

    return {
      totalTokens: totals.length,
      topByQuota: top,
    };
  }
}
