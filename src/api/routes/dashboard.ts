import { z } from 'zod';
import type { ApiApp } from '../app-type.js';
import type { ApiDeps } from '../deps.js';

const num = z.string().regex(/^\d+$/).transform(Number);

const daysQuery = z.object({ days: num.optional() });

/** 总览聚合：KPI + 时间线 + 维度 Top + 渠道健康 + 告警速览（单请求） */
export function registerDashboardRoutes(app: ApiApp, deps: ApiDeps): void {
  app.get('/dashboard', { schema: { querystring: daysQuery } }, async (request) => {
    const days = Math.min(request.query.days ?? 7, 90);
    const { analytics } = deps;

    const now = Date.now();
    const end = now;
    // 上一窗口（同长度）
    const start = end - days * 86_400_000;

    const [summary, prevSummary, timeline, topModels, topChannels, topUsers, channelHealth] =
      await Promise.all([
        analytics.getSummary(),
        analytics.getSummary(start, end),
        analytics.getTimeline(days),
        analytics.getDimension('model', days, 'requests', 8, 0),
        analytics.getDimension('channel', days, 'requests', 8, 0),
        analytics.getDimension('user', days, 'requests', 8, 0),
        analytics.getDimension('channel', days, 'errors', 8, 0),
      ]);

    return {
      days,
      start: end - days * 86_400_000,
      end,
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
