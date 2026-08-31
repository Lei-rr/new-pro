import type { FastifyInstance } from 'fastify';
import type { IStore } from '../../store/interface.js';
import type { AnalysisEngine } from '../../engine/registry.js';
import { getIpLocation } from '../../utils/geo.js';

export function registerAlertRoutes(
  app: FastifyInstance,
  _store: IStore,
  engine: AnalysisEngine,
): void {
  app.get('/api/alerts', async () => {
    const alerts = engine.checkAlerts().map((a) => {
      if (a.details && typeof a.details.ip === 'string') {
        return {
          ...a,
          details: {
            ...a.details,
            location: getIpLocation(a.details.ip as string),
          },
        };
      }
      return a;
    });

    const summaries = engine.getAllSummaries();

    // Attach IP locations to abuse highRiskIps
    if (summaries['abuse-detection'] && Array.isArray((summaries['abuse-detection'] as any).highRiskIps)) {
      (summaries['abuse-detection'] as any).highRiskIps = (summaries['abuse-detection'] as any).highRiskIps.map(
        (item: any) => ({
          ...item,
          location: getIpLocation(item.ip),
        }),
      );
    }

    if (summaries['abuse-detection'] && Array.isArray((summaries['abuse-detection'] as any).whaleRecords)) {
      (summaries['abuse-detection'] as any).whaleRecords = (summaries['abuse-detection'] as any).whaleRecords.map(
        (item: any) => ({
          ...item,
          ipLocation: getIpLocation(item.ip),
        }),
      );
    }

    return {
      count: alerts.length,
      alerts,
      summaries,
    };
  });
}
