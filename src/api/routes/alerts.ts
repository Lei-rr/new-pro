import { z } from 'zod';
import type { ApiApp } from '../app-type.js';
import type { ApiDeps } from '../deps.js';

const severityQuery = z.object({
  severity: z.enum(['info', 'warning', 'critical']).optional(),
});

/** 告警中心：引擎规则输出 + 严重度筛选 */
export function registerAlertRoutes(app: ApiApp, deps: ApiDeps): void {
  app.get('/alerts', { schema: { querystring: severityQuery } }, async (request) => {
    const sev = request.query.severity;
    const alerts = deps.alerts.checkAlerts().filter((a: { severity: string }) => !sev || a.severity === sev);
    return {
      count: alerts.length,
      alerts,
      summaries: {},
    };
  });
}
