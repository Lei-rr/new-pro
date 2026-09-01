import { z } from 'zod';
import type { ApiApp } from '../app-type.js';
import type { IStore } from '../../store/interface.js';
import type { AnalysisEngine } from '../../engine/registry.js';

const num = z.string().regex(/^\d+$/).transform(Number);

const trendQuery = z.object({
  days: num.optional(),
});

export function registerCostRoutes(
  app: ApiApp,
  store: IStore,
  engine: AnalysisEngine,
): void {
  app.get('/cost/summary', async () => {
    const summary = store.getSummary();
    const costPlugin = engine.getPlugin('cost');
    return {
      totalQuota: summary.totalQuota,
      totalCost: summary.totalCost,
      totalRequests: summary.totalRequests,
      billingRequests: summary.billingRequests,
      avgCostPerRequest: summary.billingRequests > 0
        ? summary.totalCost / summary.billingRequests
        : 0,
      pluginDetails: costPlugin?.getSummary() ?? {},
    };
  });

  app.get('/cost/trend', { schema: { querystring: trendQuery } }, async (request) => {
    const raw = request.query.days ?? 7;
    const days = Math.min(raw > 0 ? raw : 7, 90);
    return store.getCostTrend(days);
  });
}
