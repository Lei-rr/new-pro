import { z } from 'zod';
import type { ApiApp } from '../app-type.js';
import type { IStore } from '../../store/interface.js';
import type { DimensionQuery } from '../../types/stats.js';

const epochMs = z.string().regex(/^\d+$/).transform(Number);
const num = z.string().regex(/^\d+$/).transform(Number);

const VALID_DIMENSIONS = ['channel', 'model', 'token', 'user', 'ip', 'group'] as const;

const dimensionParams = z.object({ type: z.enum(VALID_DIMENSIONS) });

const dimensionQuery = z.object({
  start: epochMs.optional(),
  end: epochMs.optional(),
  sort: z.enum(['requests', 'tokens', 'quota', 'errors', 'cost', 'frt']).optional(),
  limit: num.optional(),
  offset: num.optional(),
});

export function registerDimensionRoutes(app: ApiApp, store: IStore): void {
  app.get(
    '/dimension/:type',
    { schema: { params: dimensionParams, querystring: dimensionQuery } },
    async (request) => {
      const { type } = request.params;

      const limit = Math.min(Math.max(1, request.query.limit ?? 100), 1000);
      const offset = Math.max(0, request.query.offset ?? 0);

      const query: DimensionQuery = {
        start: request.query.start,
        end: request.query.end,
        sort: request.query.sort ?? 'requests',
        limit,
        offset,
      };

      const res = store.getDimensionStats(type, query);
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
