import { z } from 'zod';
import type { ApiApp } from '../app-type.js';
import type { IStore } from '../../store/interface.js';

const epochMs = z.string().regex(/^\d+$/).transform(Number);

const summaryQuery = z.object({
  start: epochMs.optional(),
  end: epochMs.optional(),
});

const timelineQuery = z.object({
  hours: epochMs.optional(),
});

export function registerOverviewRoutes(app: ApiApp, store: IStore): void {
  app.get('/overview/summary', { schema: { querystring: summaryQuery } }, async (request) => {
    const { start, end } = request.query;
    return store.getSummary(start, end);
  });

  app.get('/overview/timeline', { schema: { querystring: timelineQuery } }, async (request) => {
    const raw = request.query.hours ?? 24;
    const hours = Math.min(raw > 0 ? raw : 24, 168); // max 7 days
    return store.getTimeline(hours);
  });
}
