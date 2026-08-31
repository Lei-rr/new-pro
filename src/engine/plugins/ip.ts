import type { AnalysisPlugin } from '../plugin.js';
import type { ParsedLogEntry } from '../../types/log.js';
import { isGin } from '../../types/log.js';
import type { Alert } from '../../types/stats.js';
import { getEnv } from '../../env.js';
import { toMinuteKey } from '../../utils/format.js';

/** Rolling window for IP activity tracking. */
const WINDOW_MS = 60 * 60 * 1000; // 1 hour

/**
 * IP rate tracking for high-frequency detection.
 * Tracks a rolling 1-hour window so memory stays bounded.
 */
export class IpPlugin implements AnalysisPlugin {
  readonly name = 'ip';

  // ip -> minute_key -> count
  private minuteRates = new Map<string, Map<string, number>>();
  private lastSeen = new Map<string, number>();

  ingest(entry: ParsedLogEntry): void {
    if (!isGin(entry)) return;

    const ip = entry.ip;
    const ts = entry.timestamp.getTime();

    let minutes = this.minuteRates.get(ip);
    if (!minutes) {
      minutes = new Map();
      this.minuteRates.set(ip, minutes);
    }

    const mk = toMinuteKey(entry.timestamp);
    minutes.set(mk, (minutes.get(mk) ?? 0) + 1);
    this.lastSeen.set(ip, ts);

    // Keep at most 10 minute-keys per IP
    if (minutes.size > 10) {
      const keys = [...minutes.keys()].sort();
      for (let i = 0; i < keys.length - 10; i++) {
        minutes.delete(keys[i]);
      }
    }
  }

  private prune(now: number): void {
    for (const [ip, last] of this.lastSeen) {
      if (now - last > WINDOW_MS) {
        this.minuteRates.delete(ip);
        this.lastSeen.delete(ip);
      }
    }
  }

  checkAlerts(): Alert[] {
    const now = Date.now();
    this.prune(now);

    const threshold = getEnv().ALERT_IP_RATE_PER_MIN;
    const alerts: Alert[] = [];
    const currentMinute = toMinuteKey(new Date(now));

    for (const [ip, minutes] of this.minuteRates) {
      const rate = minutes.get(currentMinute) ?? 0;
      if (rate > threshold) {
        alerts.push({
          id: `ip-rate-${ip}`,
          ruleId: 'ip-high-freq',
          severity: rate > threshold * 3 ? 'critical' : 'warning',
          message: `IP ${ip} sent ${rate} requests in the current minute (threshold: ${threshold})`,
          timestamp: now,
          details: { ip, rate, threshold },
        });
      }
    }

    return alerts;
  }

  getSummary(): Record<string, unknown> {
    const now = Date.now();
    this.prune(now);

    const totals = new Map<string, number>();
    for (const [ip, minutes] of this.minuteRates) {
      let sum = 0;
      for (const count of minutes.values()) sum += count;
      totals.set(ip, sum);
    }

    return {
      windowMinutes: WINDOW_MS / 60_000,
      uniqueIps: totals.size,
      topIps: [...totals.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([ip, count]) => ({ ip, requests: count })),
    };
  }
}
