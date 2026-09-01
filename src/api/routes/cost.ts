import { z } from 'zod';
import type { ApiApp } from '../app-type.js';
import type { ApiDeps } from '../deps.js';
import { QUOTA_PER_COST_UNIT } from '../../constants.js';

const num = z.string().regex(/^\d+$/).transform(Number);

const daysQuery = z.object({ days: num.optional() });

/** 成本分析聚合：KPI + 趋势 + Token/模型消耗榜 */
export function registerCostRoutes(app: ApiApp, deps: ApiDeps): void {
  app.get('/cost/analytics', { schema: { querystring: daysQuery } }, async (request) => {
    const days = Math.min(Math.max(1, request.query.days ?? 7), 90);
    const { analytics } = deps;

    const [summary, timeline, tokenTop, modelTop] = await Promise.all([
      analytics.getSummary(),
      analytics.getTimeline(days),
      analytics.getDimension('token', days, 'quota', 10, 0),
      analytics.getDimension('model', days, 'quota', 8, 0),
    ]);

    return {
      totalQuota: summary.totalQuota,
      totalCost: summary.totalCost,
      billingRequests: summary.billingRequests,
      avgCostPerRequest: summary.billingRequests > 0
        ? summary.totalCost / summary.billingRequests
        : 0,
      todayCost: summary.totalCost,
      todayRequests: summary.billingRequests,
      trend: timeline.map((t: { time: string; quota: number; requests: number }) => ({
        date: t.time.slice(0, 10),
        quota: t.quota,
        cost: t.quota / QUOTA_PER_COST_UNIT,
        requests: t.requests,
      })),
      tokenTop: tokenTop.data,
      modelTop: modelTop.data,
    };
  });
}
