import type { FastifyInstance } from 'fastify';
import type { IStore } from '../../store/interface.js';

export function registerOverviewRoutes(app: FastifyInstance, store: IStore): void {
  app.get<{
    Querystring: { start?: string; end?: string };
  }>('/api/overview/summary', async (request) => {
    const start = request.query.start ? Number(request.query.start) : undefined;
    const end = request.query.end ? Number(request.query.end) : undefined;
    return store.getSummary(
      Number.isFinite(start) ? start : undefined,
      Number.isFinite(end) ? end : undefined,
    );
  });

  app.get<{
    Querystring: { hours?: string };
  }>('/api/overview/timeline', async (request) => {
    const hours = Math.min(
      parseInt(request.query.hours ?? '24', 10) || 24,
      168, // max 7 days
    );
    return store.getTimeline(hours);
  });
}
