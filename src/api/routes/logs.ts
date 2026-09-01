import { z } from 'zod';
import type { ApiApp } from '../app-type.js';
import type { ApiDeps } from '../deps.js';

const num = z.string().regex(/^\d+$/).transform(Number);

const streamQuery = z.object({
  kind: z.enum(['all', 'consume', 'error', 'sys', 'success', 'failure']).optional(),
  days: num.optional(),
  q: z.string().optional(),
  limit: num.optional(),
  offset: num.optional(),
});

/** 原始日志流（PG logs 表，类型筛选 + 关键字搜索） */
export function registerLogRoutes(app: ApiApp, deps: ApiDeps): void {
  app.get('/logs/stream', { schema: { querystring: streamQuery } }, async (request) => {
    const q = request.query;
    const days = Math.min(Math.max(1, q.days ?? 7), 90);
    const limit = Math.min(Math.max(1, q.limit ?? 20), 500);
    const offset = Math.max(0, q.offset ?? 0);

    const res = await deps.analytics.getLogsStream(days, q.kind ?? 'all', q.q, limit, offset);
    return {
      total: res.total,
      count: res.data.length,
      offset,
      limit,
      data: res.data,
    };
  });
}
