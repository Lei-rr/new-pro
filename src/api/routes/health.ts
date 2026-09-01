import type { ApiApp } from '../app-type.js';
import type { IStore } from '../../store/interface.js';

/** Readiness deps, provided by the bootstrap composition root. */
export interface HealthDeps {
  /** False while the ingest pipeline (watcher history load) is still starting. */
  isReady: () => boolean;
}

function livePayload(store: IStore) {
  return {
    status: 'ok',
    uptime: process.uptime(),
    entries: store.getEntryCount(),
    consume: store.getConsumeCount(),
    memory: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    timestamp: Date.now(),
  };
}

export function registerHealthRoutes(
  app: ApiApp,
  store: IStore,
  deps: HealthDeps,
): void {
  // Legacy single endpoint (kept for the existing dashboard + docker HEALTHCHECK)
  app.get('/health', async () => livePayload(store));

  // Liveness: process is up and serving
  app.get('/health/live', async () => ({ status: 'ok', uptime: process.uptime(), timestamp: Date.now() }));

  // Readiness: ingest pipeline finished startup (503 while loading history)
  app.get('/health/ready', async (_request, reply) => {
    const ready = deps.isReady();
    if (!ready) {
      return reply.code(503).send({
        status: 'degraded',
        ready: false,
        entries: store.getEntryCount(),
        timestamp: Date.now(),
      });
    }
    return { ...livePayload(store), ready: true };
  });
}
