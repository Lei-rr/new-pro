import { z } from 'zod';
import type { ApiApp } from '../../api/app-type.js';
import type { AlertsService } from './alerts.service.js';

const severityQuery = z.object({
  severity: z.enum(['info', 'warning', 'critical']).optional(),
});

/** 告警模块路由：/alerts */
export function registerAlertsRoutes(app: ApiApp, alerts: AlertsService): void {
  app.get('/alerts', { schema: { querystring: severityQuery } }, async (request) => {
    const sev = request.query.severity;
    const all = await alerts.check();
    const filtered = sev ? all.filter((a) => a.severity === sev) : all;
    return { count: filtered.length, alerts: filtered };
  });
}
