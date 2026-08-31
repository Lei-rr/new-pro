import type { AnalysisPlugin } from '../plugin.js';
import type { ParsedLogEntry } from '../../types/log.js';
import { isConsume, isGin, isError } from '../../types/log.js';
import type { Alert } from '../../types/stats.js';
import { QUOTA_PER_COST_UNIT } from '../../utils/format.js';

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
  private clientGoneCount = 0;
  private clientGoneLastSeen = 0;
  private whaleRecords: WhaleRecord[] = [];

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

      if (entry.statusCode >= 400) {
        profile.errorCount++;
        profile.statusCodes.set(
          entry.statusCode,
          (profile.statusCodes.get(entry.statusCode) ?? 0) + 1,
        );
      }
    }

    // 2. Cancellation spike
    if (isConsume(entry) && entry.params.other?.stream_status?.end_reason === 'client_gone') {
      this.clientGoneCount++;
      this.clientGoneLastSeen = ts;
    }
    if (isError(entry) && entry.message.includes('client_gone')) {
      this.clientGoneCount++;
      this.clientGoneLastSeen = ts;
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

  checkAlerts(): Alert[] {
    const alerts: Alert[] = [];

    // 1. IP Probing / Anti-Abuse detection
    for (const [ip, p] of this.ipProfiles) {
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

    // 2. Cancellation surge
    if (this.clientGoneCount >= 50) {
      alerts.push({
        id: 'client-cancel-surge',
        ruleId: 'cancellation-surge',
        severity: 'warning',
        message: `检测到客户端超时主动中断突增（累计 ${this.clientGoneCount} 次 client_gone），请关注上游模型首字响应耗时与网络延迟。`,
        timestamp: this.clientGoneLastSeen || Date.now(),
        details: { totalCancels: this.clientGoneCount },
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
      clientGoneCount: this.clientGoneCount,
      whaleRecords: this.whaleRecords.slice(-20).reverse(),
    };
  }
}
