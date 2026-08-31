import type { AnalysisPlugin } from '../plugin.js';
import type { ParsedLogEntry } from '../../types/log.js';
import { isConsume } from '../../types/log.js';
import type { Alert } from '../../types/stats.js';
import { getEnv } from '../../env.js';
import { QUOTA_PER_COST_UNIT } from '../../utils/format.js';

/**
 * Per-token (API key) usage tracking and abuse detection.
 */
export class TokenPlugin implements AnalysisPlugin {
  readonly name = 'token';

  private tokenQuota = new Map<string, number>();
  private tokenRequests = new Map<string, number>();

  ingest(entry: ParsedLogEntry): void {
    if (!isConsume(entry)) return;
    const name = entry.params.token_name;
    this.tokenQuota.set(name, (this.tokenQuota.get(name) ?? 0) + entry.params.quota);
    this.tokenRequests.set(name, (this.tokenRequests.get(name) ?? 0) + 1);
  }

  checkAlerts(): Alert[] {
    const threshold = getEnv().ALERT_QUOTA_THRESHOLD;
    const alerts: Alert[] = [];

    for (const [name, quota] of this.tokenQuota) {
      if (quota > threshold) {
        alerts.push({
          id: `token-quota-${name}`,
          ruleId: 'token-high-quota',
          severity: 'warning',
          message: `Token "${name}" has consumed ${(quota / QUOTA_PER_COST_UNIT).toFixed(2)} total quota`,
          timestamp: Date.now(),
          details: { token: name, quota, cost: quota / QUOTA_PER_COST_UNIT },
        });
      }
    }

    return alerts;
  }

  getSummary(): Record<string, unknown> {
    return {
      totalTokens: this.tokenQuota.size,
      topByQuota: [...this.tokenQuota.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([name, quota]) => ({
          name,
          quota,
          cost: quota / QUOTA_PER_COST_UNIT,
          requests: this.tokenRequests.get(name) ?? 0,
        })),
    };
  }
}
