import type { ApiApp } from '../app-type.js';
import type { AnalysisEngine } from '../../engine/registry.js';
import { getIpLocation } from '../../utils/geo.js';
import { z } from 'zod';

interface HighRiskIpSummary {
  ip: string;
  totalRequests: number;
  errorCount: number;
  errorRate: string;
  lastSeen: number;
  firstSeen: number;
}

interface WhaleRecordSummary {
  requestId: string;
  timestamp: number;
  model: string;
  userId: number;
  ip: string | null;
  tokenName: string;
  cost: string | number;
  quota: number;
  promptTokens: number;
  completionTokens: number;
}

const severityQuery = z.object({
  severity: z.enum(['info', 'warning', 'critical']).optional(),
});

export function registerAlertRoutes(
  app: ApiApp,
  engine: AnalysisEngine,
): void {
  app.get('/alerts', { schema: { querystring: severityQuery } }, async (request) => {
    const sev = request.query.severity;
    const alerts = engine.checkAlerts()
      .filter((a) => !sev || a.severity === sev)
      .map((a) => {
      if (a.details && typeof a.details.ip === 'string') {
        return {
          ...a,
          details: {
            ...a.details,
            location: getIpLocation(a.details.ip),
          },
        };
      }
      return a;
    });

    const summaries = engine.getAllSummaries();
    const abuse = summaries['abuse-detection'];

    if (abuse && Array.isArray(abuse.highRiskIps)) {
      abuse.highRiskIps = (abuse.highRiskIps as HighRiskIpSummary[]).map((item) => ({
        ...item,
        location: getIpLocation(item.ip),
      }));
    }

    if (abuse && Array.isArray(abuse.whaleRecords)) {
      abuse.whaleRecords = (abuse.whaleRecords as WhaleRecordSummary[]).map((item) => ({
        ...item,
        ipLocation: getIpLocation(item.ip),
      }));
    }

    return {
      count: alerts.length,
      alerts,
      summaries,
    };
  });
}
