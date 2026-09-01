import { z } from 'zod';
import type { ApiApp } from '../app-type.js';
import type { IStore } from '../../store/interface.js';

const num = z.string().regex(/^\d+$/).transform(Number);

const dashboardQuery = z.object({
  hours: num.optional(),
});

/**
 * 总览页聚合端点：一次请求返回 KPI（当前+上期）、时间线、Top 榜。
 * 前端据此计算 delta 与渲染整页，无需多个请求拼装。
 */
export function registerDashboardRoutes(app: ApiApp, store: IStore): void {
  app.get('/dashboard', { schema: { querystring: dashboardQuery } }, async (request) => {
    const raw = request.query.hours ?? 24;
    const hours = Math.min(raw > 0 ? raw : 24, 168);

    const now = Date.now();
    const windowMs = hours * 3_600_000;
    const start = now - windowMs;

    const top = (dimension: 'model' | 'channel' | 'user') =>
      store.getDimensionStats(dimension, { sort: 'requests', limit: 8 }).data;

    return {
      hours,
      start,
      end: now,
      summary: store.getSummary(start, now),
      prevSummary: store.getSummary(start - windowMs, start),
      timeline: store.getTimeline(hours),
      topModels: top('model'),
      topChannels: top('channel'),
      topUsers: top('user'),
    };
  });
}
