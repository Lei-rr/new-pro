import type { FastifyInstance } from 'fastify';
import type { IStore } from '../../store/interface.js';
import type { AnalysisEngine } from '../../engine/registry.js';

export function registerCostRoutes(
  app: FastifyInstance,
  store: IStore,
  engine: AnalysisEngine,
): void {
  app.get('/api/cost/summary', async () => {
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

  app.get<{
    Querystring: { days?: string };
  }>('/api/cost/trend', async (request) => {
    const days = Math.min(
      parseInt(request.query.days ?? '7', 10) || 7,
      90,
    );
    return store.getCostTrend(days);
  });
}
