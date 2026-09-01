import { z } from 'zod';
import type { ApiApp } from '../app-type.js';
import type { ApiDeps } from '../deps.js';
import { getEnv } from '../../env.js';
import { startOfDayMs } from '../../utils/time.js';

const num = z.string().regex(/^\d+$/).transform(Number);

const daysQuery = z.object({ days: num.optional() });

/** 总览聚合：KPI + 时间线 + 维度 Top + 渠道健康 + 告警速览（单请求） */
export function registerDashboardRoutes(app: ApiApp, deps: ApiDeps): void {
  app.get('/dashboard', { schema: { querystring: daysQuery } }, async (request) => {
    const days = Math.min(request.query.days ?? 7, 90);
    const { analytics } = deps;

    // 窗口按业务时区自然日对齐（今天 00:00 起）
    const now = Date.now();
    const tz = getEnv().LOG_TZ;
    const start = startOfDayMs(now, tz, days - 1);
    const prevStart = startOfDayMs(now, tz, days * 2 - 1);

    const [summary, prevSummary, timeline, topModels, topChannels, topUsers, channelHealth] =
      await Promise.all([
        analytics.getSummary(start, now),
        analytics.getSummary(prevStart, start),
        analytics.getTimeline(days),
        analytics.getDimension('model', days, 'requests', 8, 0),
        analytics.getDimension('channel', days, 'requests', 8, 0),
        analytics.getDimension('user', days, 'requests', 8, 0),
        analytics.getDimension('channel', days, 'errors', 8, 0),
      ]);

    return {
      days,
      start,
      end: now,
      summary,
      prevSummary,
      timeline,
      topModels: topModels.data,
      topChannels: topChannels.data,
      topUsers: topUsers.data,
      channelHealth: channelHealth.data.map((d: { key: string; requests: number; errors: number }) => ({
        key: d.key,
        requests: d.requests,
        errors: d.errors,
        errorRate: d.requests > 0 ? d.errors / d.requests : 0,
      })),
      alerts: deps.alerts.checkAlerts().slice(0, 5),
    };
  });
}
