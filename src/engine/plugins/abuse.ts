import type { AnalysisPlugin } from '../plugin.js';
import type { ParsedLogEntry } from '../../types/log.js';
import { isConsume, isGin } from '../../types/log.js';
import type { Alert } from '../../types/stats.js';
import { getEnv } from '../../env.js';
import { QUOTA_PER_COST_UNIT } from '../../constants.js';

/** Sliding window for cancellation surge detection. */
const CLIENT_GONE_WINDOW_MS = 60 * 60 * 1000;
/** Min cancellations within the window to fire the surge alert. */
const CLIENT_GONE_SURGE_THRESHOLD = 50;
/** How often the full IP profile map is pruned. */
const IP_PROFILE_PRUNE_INTERVAL_MS = 5 * 60_000;

export interface IpAbuseProfile {
  ip: string;
  totalRequests: number;
  errorCount: number;
  lastSeen: number;
  firstSeen: number;
  models: Set<string>;
  statusCodes: Map<number, number>;
}

export interface WhaleRecord {
  requestId: string;
  timestamp: number;
  model: string;
  userId: number;
  ip: string | null;
  tokenName: string;
  cost: number;
  quota: number;
  promptTokens: number;
  completionTokens: number;
}

/**
 * Advanced anti-abuse, IP brute-force probing, large token spend anomalies and user cancellation detection.
 */
export class AbuseDetectionPlugin implements AnalysisPlugin {
  readonly name = 'abuse-detection';

  private ipProfiles = new Map<string, IpAbuseProfile>();
  private clientGoneTimes: number[] = [];
  private whaleRecords: WhaleRecord[] = [];
  private dirtyIps = new Set<string>();
  private lastIpPrune = 0;

  ingest(entry: ParsedLogEntry): void {
    const ts = entry.timestamp.getTime();

    // 1. IP Traffic & Error tracking
    if (isGin(entry) && entry.ip && entry.ip !== '::1') {
      const ip = entry.ip;
      let profile = this.ipProfiles.get(ip);
      if (!profile) {
        profile = {
          ip,
          totalRequests: 0,
          errorCount: 0,
          firstSeen: ts,
          lastSeen: ts,
          models: new Set(),
          statusCodes: new Map(),
        };
        this.ipProfiles.set(ip, profile);
      }

      profile.totalRequests++;
      if (ts > profile.lastSeen) profile.lastSeen = ts;

      // Mark dirty so checkAlerts only rescans IPs with new activity
      this.dirtyIps.add(ip);

      if (entry.statusCode >= 400) {
        profile.errorCount++;
        profile.statusCodes.set(
          entry.statusCode,
          (profile.statusCodes.get(entry.statusCode) ?? 0) + 1,
        );
      }
    }

    // 2. Cancellation spike
    // Single source of truth: the consume record's stream_status.end_reason.
    // ERR lines containing "client_gone" describe the same logical event and
    // must not be counted a second time.
    if (isConsume(entry) && entry.params.other?.stream_status?.end_reason === 'client_gone') {
      this.clientGoneTimes.push(ts);
    }

    // 3. Giant single request detection (Cost >= $1.0 or Prompt tokens >= 100k)
    if (isConsume(entry)) {
      const p = entry.params;
      const cost = p.quota / QUOTA_PER_COST_UNIT;
      if (cost >= 1.0 || p.prompt_tokens >= 100_000) {
        this.whaleRecords.push({
          requestId: entry.requestId,
          timestamp: ts,
          model: p.model_name,
          userId: entry.userId,
          ip: entry.ip ?? null,
          tokenName: p.token_name || 'default',
          cost,
          quota: p.quota,
          promptTokens: p.prompt_tokens,
          completionTokens: p.completion_tokens,
        });

        if (this.whaleRecords.length > 200) {
          this.whaleRecords.shift();
        }
      }

      if (entry.ip) {
        const profile = this.ipProfiles.get(entry.ip);
        if (profile) profile.models.add(p.model_name);
      }
    }
  }

  private pruneClientGone(now: number): void {
    const cutoff = now - CLIENT_GONE_WINDOW_MS;
    let i = 0;
    while (i < this.clientGoneTimes.length && this.clientGoneTimes[i] <= cutoff) i++;
    if (i > 0) this.clientGoneTimes.splice(0, i);
  }

  /** Drop IP profiles inactive for longer than the store retention window. */
  private pruneIpProfiles(now: number): void {
    if (now - this.lastIpPrune < IP_PROFILE_PRUNE_INTERVAL_MS) return;
    this.lastIpPrune = now;
    const cutoff = now - Math.max(getEnv().RETENTION_HOURS, 1) * 3_600_000;
    for (const [ip, profile] of this.ipProfiles) {
      if (profile.lastSeen < cutoff) {
        this.ipProfiles.delete(ip);
        this.dirtyIps.delete(ip);
      }
    }
  }

  checkAlerts(): Alert[] {
    const alerts: Alert[] = [];
    const now = Date.now();
    this.pruneIpProfiles(now);

    // 1. IP Probing / Anti-Abuse detection (incremental: only dirty IPs)
    for (const ip of this.dirtyIps) {
      const p = this.ipProfiles.get(ip);
      if (!p) continue;
      if (p.errorCount >= 10) {
        const errorRate = p.totalRequests > 0 ? p.errorCount / p.totalRequests : 0;
        const isCritical = p.errorCount >= 100 || (p.errorCount >= 20 && errorRate > 0.7);

        const statusSummary = [...p.statusCodes.entries()]
          .map(([code, count]) => `${code}x${count}`)
          .join(', ');

        alerts.push({
          id: `ip-abuse-${ip}`,
          ruleId: 'ip-abuse-probe',
          severity: isCritical ? 'critical' : 'warning',
          message: `IP「${ip}」检测到高频异常失败：累计 ${p.errorCount} 次报错（失败率 ${(errorRate * 100).toFixed(1)}%，状态码: ${statusSummary}），疑似恶意扫描、未授权探测或暴力攻击！`,
          timestamp: p.lastSeen,
          details: {
            ip,
            totalRequests: p.totalRequests,
            errorCount: p.errorCount,
            errorRate: `${(errorRate * 100).toFixed(1)}%`,
            statusCodes: statusSummary,
            lastSeen: p.lastSeen,
          },
        });
      }
    }
    this.dirtyIps.clear();

    // 2. Cancellation surge (rolling window, resets automatically)
    this.pruneClientGone(now);
    if (this.clientGoneTimes.length >= CLIENT_GONE_SURGE_THRESHOLD) {
      alerts.push({
        id: 'client-cancel-surge',
        ruleId: 'cancellation-surge',
        severity: 'warning',
        message: `检测到客户端超时主动中断突增（最近 60 分钟内 ${this.clientGoneTimes.length} 次 client_gone），请关注上游模型首字响应耗时与网络延迟。`,
        timestamp: this.clientGoneTimes[this.clientGoneTimes.length - 1] ?? now,
        details: {
          windowMinutes: CLIENT_GONE_WINDOW_MS / 60_000,
          totalCancels: this.clientGoneTimes.length,
        },
      });
    }

    // 3. Top whale requests
    const topWhales = [...this.whaleRecords].sort((a, b) => b.cost - a.cost).slice(0, 10);
    for (const w of topWhales) {
      alerts.push({
        id: `whale-${w.requestId}`,
        ruleId: 'whale-request',
        severity: w.cost >= 10.0 ? 'warning' : 'info',
        message: `大额单次消费异动：模型「${w.model}」单次消耗 $${w.cost.toFixed(2)} (${w.promptTokens.toLocaleString()} 输入 + ${w.completionTokens.toLocaleString()} 输出 Token)，用户 #${w.userId} (令牌: ${w.tokenName})`,
        timestamp: w.timestamp,
        details: {
          requestId: w.requestId,
          model: w.model,
          userId: w.userId,
          ip: w.ip,
          cost: `$${w.cost.toFixed(2)}`,
          promptTokens: w.promptTokens,
          completionTokens: w.completionTokens,
        },
      });
    }

    return alerts;
  }

  getSummary(): Record<string, unknown> {
    const now = Date.now();
    this.pruneClientGone(now);

    const highRiskIps = [...this.ipProfiles.values()]
      .filter((p) => p.errorCount >= 5)
      .sort((a, b) => b.errorCount - a.errorCount)
      .slice(0, 20)
      .map((p) => ({
        ip: p.ip,
        totalRequests: p.totalRequests,
        errorCount: p.errorCount,
        errorRate: p.totalRequests > 0 ? (p.errorCount / p.totalRequests * 100).toFixed(1) + '%' : '0%',
        lastSeen: p.lastSeen,
        firstSeen: p.firstSeen,
      }));

    return {
      highRiskIps,
      clientGoneCount: this.clientGoneTimes.length,
      whaleRecords: this.whaleRecords.slice(-20).reverse(),
    };
  }
}
