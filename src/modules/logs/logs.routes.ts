import { z } from 'zod';
import type { ApiApp } from '../../api/app-type.js';
import type { LogsService } from './logs.service.js';

const num = z.string().regex(/^\d+$/).transform(Number);

const streamQuery = z.object({
  kind: z.enum(['all', 'consume', 'error', 'sys', 'success', 'failure']).optional(),
  days: num.optional(),
  q: z.string().optional().transform((v) => (v && v.trim().length > 0 ? v : undefined)),
  limit: num.optional(),
  offset: num.optional(),
});

/** 日志模块路由：/logs/stream */
export function registerLogsRoutes(app: ApiApp, logs: LogsService): void {
  app.get('/logs/stream', { schema: { querystring: streamQuery } }, async (request) => {
    const q = request.query;
    const days = Math.min(Math.max(1, q.days ?? 7), 90);
    const limit = Math.min(Math.max(1, q.limit ?? 20), 500);
    const offset = Math.max(0, q.offset ?? 0);
    return logs.stream(days, q.kind ?? 'all', q.q, limit, offset);
  });
}
