import type { FastifyInstance } from 'fastify';
import type { IStore } from '../../store/interface.js';
import type { DimensionType, DimensionQuery } from '../../types/stats.js';

const VALID_DIMENSIONS: DimensionType[] = ['channel', 'model', 'token', 'user', 'ip', 'group'];

export function registerDimensionRoutes(app: FastifyInstance, store: IStore): void {
  app.get<{
    Params: { type: string };
    Querystring: { start?: string; end?: string; sort?: string; limit?: string; offset?: string };
  }>('/api/dimension/:type', async (request, reply) => {
    const { type } = request.params;

    if (!VALID_DIMENSIONS.includes(type as DimensionType)) {
      return reply.badRequest(`Invalid dimension: ${type}. Valid: ${VALID_DIMENSIONS.join(', ')}`);
    }

    const limit = Math.min(Math.max(1, parseInt(request.query.limit ?? '100', 10) || 100), 1000);
    const offset = Math.max(0, parseInt(request.query.offset ?? '0', 10) || 0);

    const query: DimensionQuery = {
      start: request.query.start ? Number(request.query.start) || undefined : undefined,
      end: request.query.end ? Number(request.query.end) || undefined : undefined,
      sort: (request.query.sort as DimensionQuery['sort']) ?? 'requests',
      limit,
      offset,
    };

    const res = store.getDimensionStats(type as DimensionType, query);
    return {
      dimension: type,
      total: res.total,
      offset,
      limit,
      count: res.data.length,
      data: res.data,
    };
  });
}
