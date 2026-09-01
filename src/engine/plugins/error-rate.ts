import type { AnalysisPlugin } from '../plugin.js';
import type { ParsedLogEntry } from '../../types/log.js';
import { isConsume, isError, isGin } from '../../types/log.js';
import type { Alert } from '../../types/stats.js';
import { getEnv } from '../../env.js';
import { minuteKeyToEpochMs, toMinuteKey } from '../../utils/time.js';

/**
 * Global error rate monitoring over a sliding 5-minute window.
 * Uses minute buckets so checkAlerts cost is O(buckets), not O(events).
 */
export class ErrorRatePlugin implements AnalysisPlugin {
  readonly name = 'error-rate';

  private windowMs = 5 * 60_000;
  private minutes = new Map<string, { requests: number; errors: number }>();

  ingest(entry: ParsedLogEntry): void {
    const mk = toMinuteKey(entry.timestamp, getEnv().LOG_TZ);
    let bucket = this.minutes.get(mk);
    if (!bucket) {
      bucket = { requests: 0, errors: 0 };
      this.minutes.set(mk, bucket);
    }

    if (isConsume(entry)) bucket.requests++;
    if (isError(entry) || (isGin(entry) && entry.statusCode >= 400)) bucket.errors++;
  }

  /** Sum requests/errors in the window, pruning expired buckets. */
  private windowStats(now: number): { requests: number; errors: number } {
    const cutoff = now - this.windowMs;
    const tz = getEnv().LOG_TZ;
    let requests = 0;
    let errors = 0;
    for (const [key, bucket] of this.minutes) {
      if (minuteKeyToEpochMs(key, tz) < cutoff) {
        this.minutes.delete(key);
        continue;
      }
      requests += bucket.requests;
      errors += bucket.errors;
    }
    return { requests, errors };
  }

  checkAlerts(): Alert[] {
    const now = Date.now();
    const { requests, errors } = this.windowStats(now);
    const threshold = getEnv().ALERT_ERROR_RATE;

    if (requests < 10) return [];

    const rate = errors / requests;
    if (rate > threshold) {
      return [{
        id: 'error-rate-high',
        ruleId: 'error-rate',
        severity: rate > threshold * 2 ? 'critical' : 'warning',
        message: `Error rate ${(rate * 100).toFixed(1)}% in last 5 min (${errors}/${requests})`,
        timestamp: now,
        details: { rate, errors, requests },
      }];
    }

    return [];
  }

  getSummary(): Record<string, unknown> {
    const { requests, errors } = this.windowStats(Date.now());
    return {
      windowMinutes: this.windowMs / 60_000,
      recentRequests: requests,
      recentErrors: errors,
      errorRate: requests > 0 ? errors / requests : 0,
    };
  }
}
