import { z } from 'zod';
import type { ApiApp } from '../app-type.js';
import type { ApiDeps } from '../deps.js';

const num = z.string().regex(/^\d+$/).transform(Number);

const DIMENSIONS = ['model', 'channel', 'token', 'user', 'group'] as const;

const dimensionParams = z.object({ type: z.enum(DIMENSIONS) });

const dimensionQuery = z.object({
  days: num.optional(),
  sort: z.enum(['requests', 'tokens', 'quota', 'cost', 'errors', 'frt']).optional(),
  limit: num.optional(),
  offset: num.optional(),
});

/** 维度分析：SQL group-by（自然日窗口） */
export function registerDimensionRoutes(app: ApiApp, deps: ApiDeps): void {
  app.get(
    '/dimension/:type',
    { schema: { params: dimensionParams, querystring: dimensionQuery } },
    async (request) => {
      const { type } = request.params;
      const days = Math.min(Math.max(1, request.query.days ?? 7), 90);
      const limit = Math.min(Math.max(1, request.query.limit ?? 20), 200);
      const offset = Math.max(0, request.query.offset ?? 0);

      const res = await deps.analytics.getDimension(
        type,
        days,
        request.query.sort ?? 'requests',
        limit,
        offset,
      );
      return {
        dimension: type,
        total: res.total,
        offset,
        limit,
        count: res.data.length,
        data: res.data,
      };
    },
  );
}
