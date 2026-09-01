import { z } from 'zod';
import type { ApiApp } from '../app-type.js';
import type { IStore } from '../../store/interface.js';

const num = z.string().regex(/^\d+$/).transform(Number);

const costQuery = z.object({
  days: num.optional(),
});

/**
 * 成本页聚合端点：KPI + 趋势 + Token 消耗榜一次返回。
 */
export function registerCostAnalyticsRoutes(app: ApiApp, store: IStore): void {
  app.get('/cost/analytics', { schema: { querystring: costQuery } }, async (request) => {
    const raw = request.query.days ?? 14;
    const days = Math.min(raw > 0 ? raw : 14, 90);

    const summary = store.getSummary();
    const trend = store.getCostTrend(days);
    const tokenTop = store.getDimensionStats('token', { sort: 'quota', limit: 10 }).data;
    const modelTop = store.getDimensionStats('model', { sort: 'quota', limit: 8 }).data;

    const todayKey = trend.length > 0 ? trend[trend.length - 1].date : '';
    const todayCost = trend.find((t) => t.date === todayKey)?.cost ?? 0;

    return {
      totalQuota: summary.totalQuota,
      totalCost: summary.totalCost,
      billingRequests: summary.billingRequests,
      avgCostPerRequest: summary.billingRequests > 0
        ? summary.totalCost / summary.billingRequests
        : 0,
      todayCost,
      todayRequests: trend.find((t) => t.date === todayKey)?.requests ?? 0,
      trend,
      tokenTop,
      modelTop,
    };
  });
}
