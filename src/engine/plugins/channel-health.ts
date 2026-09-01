import type { AnalysisPlugin } from '../plugin.js';
import type { ParsedLogEntry } from '../../types/log.js';
import { isError } from '../../types/log.js';
import type { Alert } from '../../types/stats.js';

interface ChannelStat {
  channelId: string;
  totalFailures: number;
  statusCodes: Map<number, number>;
  sampleMessages: string[];
  lastSeen: number;
}

interface ModelExhaustionStat {
  model: string;
  count: number;
  groups: Set<string>;
  lastSeen: number;
}

/**
 * Monitors upstream channel failures, 503 outages, and channel exhaustion across all historical logs and real-time streams.
 */
export class ChannelHealthPlugin implements AnalysisPlugin {
  readonly name = 'channel-health';

  private channels = new Map<string, ChannelStat>();
  private modelExhaustions = new Map<string, ModelExhaustionStat>();
  private dirtyChannels = new Set<string>();
  private dirtyModels = new Set<string>();

  ingest(entry: ParsedLogEntry): void {
    const ts = entry.timestamp.getTime();

    if (isError(entry)) {
      const msg = entry.message;

      // 1. Channel outage (e.g. "channel error (channel #31, status code: 503)")
      const chMatch = msg.match(/channel\s*#(\d+)/i);
      if (chMatch) {
        const chId = chMatch[1];
        let stat = this.channels.get(chId);
        if (!stat) {
          stat = {
            channelId: chId,
            totalFailures: 0,
            statusCodes: new Map(),
            sampleMessages: [],
            lastSeen: ts,
          };
          this.channels.set(chId, stat);
        }
        stat.totalFailures++;
        if (ts > stat.lastSeen) stat.lastSeen = ts;
        this.dirtyChannels.add(chId);

        const codeMatch = msg.match(/status\s*code:?\s*(\d+)/i);
        if (codeMatch) {
          const code = parseInt(codeMatch[1], 10);
          stat.statusCodes.set(code, (stat.statusCodes.get(code) ?? 0) + 1);
        }

        if (stat.sampleMessages.length < 3 && !stat.sampleMessages.includes(msg.slice(0, 100))) {
          stat.sampleMessages.push(msg.slice(0, 100));
        }
      }

      // 2. Model exhaustion (e.g. "No available channel for model xxx under group xxx")
      const modelMatch = msg.match(/No available channel for model\s+([^\s]+)(?:\s+under group\s+([^\s]+))?/i);
      if (modelMatch) {
        const model = modelMatch[1];
        const group = modelMatch[2] || 'default';
        let mStat = this.modelExhaustions.get(model);
        if (!mStat) {
          mStat = {
            model,
            count: 0,
            groups: new Set(),
            lastSeen: ts,
          };
          this.modelExhaustions.set(model, mStat);
        }
        mStat.count++;
        mStat.groups.add(group);
        if (ts > mStat.lastSeen) mStat.lastSeen = ts;
        this.dirtyModels.add(model);
      }
    }
  }

  checkAlerts(): Alert[] {
    const alerts: Alert[] = [];

    // 1. Channel outages (incremental: only channels with new failures)
    for (const chId of this.dirtyChannels) {
      const stat = this.channels.get(chId);
      if (!stat) continue;
      if (stat.totalFailures >= 10) {
        const isCritical = stat.totalFailures >= 100;
        const codeStr = [...stat.statusCodes.entries()]
          .map(([c, count]) => `${c}x${count}`)
          .join(', ');

        const sampleMsg = stat.sampleMessages[0] || '上游渠道频繁报错';

        alerts.push({
          id: `channel-outage-${chId}`,
          ruleId: 'channel-outage',
          severity: isCritical ? 'critical' : 'warning',
          message: `上游渠道 #${chId} 发生高频熔断故障：累计 ${stat.totalFailures} 次失败 (${codeStr || '异常'})，主要诊断: ${sampleMsg}，建议检查该渠道账号池或暂停。`,
          timestamp: stat.lastSeen,
          details: {
            channelId: chId,
            totalFailures: stat.totalFailures,
            statusCodes: codeStr,
            lastMessage: sampleMsg,
            lastSeen: stat.lastSeen,
          },
        });
      }
    }
    this.dirtyChannels.clear();

    // 2. Model exhaustions (incremental: only models with new failures)
    for (const model of this.dirtyModels) {
      const mStat = this.modelExhaustions.get(model);
      if (!mStat) continue;
      if (mStat.count >= 5) {
        const groups = [...mStat.groups].join(', ');
        alerts.push({
          id: `model-exhaustion-${model}`,
          ruleId: 'model-exhaustion',
          severity: 'critical',
          message: `大模型「${model}」无可用上游渠道（累计 ${mStat.count} 次调用被拒，影响分组: ${groups}），用户端请求直接失败，需立即补号或配置备用渠道！`,
          timestamp: mStat.lastSeen,
          details: {
            model,
            failureCount: mStat.count,
            affectedGroups: groups,
            lastSeen: mStat.lastSeen,
          },
        });
      }
    }
    this.dirtyModels.clear();

    return alerts;
  }

  getSummary(): Record<string, unknown> {
    const channelsList = [...this.channels.values()]
      .sort((a, b) => b.totalFailures - a.totalFailures)
      .slice(0, 15)
      .map((c) => ({
        channelId: c.channelId,
        totalFailures: c.totalFailures,
        statusCodes: Object.fromEntries(c.statusCodes),
        sampleMessage: c.sampleMessages[0] || '',
        lastSeen: c.lastSeen,
      }));

    const modelList = [...this.modelExhaustions.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, 15)
      .map((m) => ({
        model: m.model,
        count: m.count,
        groups: [...m.groups],
        lastSeen: m.lastSeen,
      }));

    return {
      channels: channelsList,
      models: modelList,
    };
  }
}
