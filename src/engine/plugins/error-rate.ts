import type { AnalysisPlugin } from '../plugin.js';
import type { ParsedLogEntry } from '../../types/log.js';
import { isConsume, isError, isGin } from '../../types/log.js';
import type { Alert } from '../../types/stats.js';
import { getEnv } from '../../env.js';

/**
 * Global error rate monitoring.
 */
export class ErrorRatePlugin implements AnalysisPlugin {
  readonly name = 'error-rate';

  private windowSize = 300_000; // 5 min sliding window
  private requestTimes: number[] = [];
  private errorTimes: number[] = [];

  ingest(entry: ParsedLogEntry): void {
    const ts = entry.timestamp.getTime();
    if (isConsume(entry)) {
      this.requestTimes.push(ts);
    }
    if (isError(entry) || (isGin(entry) && entry.statusCode >= 400)) {
      this.errorTimes.push(ts);
    }
    // Periodic cleanup
    if (this.requestTimes.length > 10_000) {
      this.cleanup();
    }
  }

  private cleanup(): void {
    const cutoff = Date.now() - this.windowSize * 2;
    this.requestTimes = this.requestTimes.filter(t => t > cutoff);
    this.errorTimes = this.errorTimes.filter(t => t > cutoff);
  }

  checkAlerts(): Alert[] {
    const threshold = getEnv().ALERT_ERROR_RATE;
    const cutoff = Date.now() - this.windowSize;
    const recentRequests = this.requestTimes.filter(t => t > cutoff).length;
    const recentErrors = this.errorTimes.filter(t => t > cutoff).length;

    if (recentRequests < 10) return [];

    const rate = recentErrors / recentRequests;
    if (rate > threshold) {
      return [{
        id: 'error-rate-high',
        ruleId: 'error-rate',
        severity: rate > threshold * 2 ? 'critical' : 'warning',
        message: `Error rate ${(rate * 100).toFixed(1)}% in last 5 min (${recentErrors}/${recentRequests})`,
        timestamp: Date.now(),
        details: { rate, errors: recentErrors, requests: recentRequests },
      }];
    }

    return [];
  }

  getSummary(): Record<string, unknown> {
    const cutoff = Date.now() - this.windowSize;
    const recentRequests = this.requestTimes.filter(t => t > cutoff).length;
    const recentErrors = this.errorTimes.filter(t => t > cutoff).length;
    return {
      windowMinutes: this.windowSize / 60_000,
      recentRequests,
      recentErrors,
      errorRate: recentRequests > 0 ? recentErrors / recentRequests : 0,
    };
  }
}
