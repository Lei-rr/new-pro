import { z } from 'zod';
import type { ApiApp } from '../../api/app-type.js';
import type { AnalyticsService } from './analytics.service.js';

const num = z.string().regex(/^\d+$/).transform(Number);

const daysQuery = z.object({ days: num.optional() });

const DIMENSIONS = ['model', 'channel', 'token', 'user', 'group'] as const;

const dimensionQuery = z.object({
  days: num.optional(),
  sort: z.enum(['requests', 'tokens', 'quota', 'cost']).optional(),
  limit: num.optional(),
  offset: num.optional(),
});

/** 统计模块路由：/dashboard /dimension/:type /cost/analytics */
export function registerAnalyticsRoutes(
  app: ApiApp,
  analytics: AnalyticsService,
  getAlerts: () => Promise<unknown[]>,
): void {
  app.get('/dashboard', { schema: { querystring: daysQuery } }, async (request) => {
    const days = Math.min(Math.max(1, request.query.days ?? 7), 90);
    return analytics.dashboard(days, await getAlerts());
  });

  app.get(
    '/dimension/:type',
    { schema: { params: z.object({ type: z.enum(DIMENSIONS) }), querystring: dimensionQuery } },
    async (request) => {
      const days = Math.min(Math.max(1, request.query.days ?? 7), 90);
      const limit = Math.min(Math.max(1, request.query.limit ?? 20), 200);
      const offset = Math.max(0, request.query.offset ?? 0);
      const res = await analytics.dimension(
        request.params.type,
        days,
        request.query.sort ?? 'requests',
        limit,
        offset,
      );
      return {
        dimension: request.params.type,
        total: res.total,
        offset,
        limit,
        count: res.data.length,
        data: res.data,
      };
    },
  );

  app.get('/cost/analytics', { schema: { querystring: daysQuery } }, async (request) => {
    const days = Math.min(Math.max(1, request.query.days ?? 7), 90);
    return analytics.costAnalytics(days);
  });
}
