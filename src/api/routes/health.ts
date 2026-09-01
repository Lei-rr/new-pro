import type { FastifyInstance } from 'fastify';
import type { ApiDeps } from '../deps.js';

function livePayload() {
  return {
    status: 'ok',
    uptime: process.uptime(),
    memory: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    timestamp: Date.now(),
  };
}

export function registerHealthRoutes(app: FastifyInstance, deps: ApiDeps): void {
  app.get('/health', async () => livePayload());
  app.get('/health/live', async () => livePayload());
  app.get('/health/ready', async (_request, reply) => {
    if (!deps.isReady()) {
      return reply.code(503).send({ status: 'degraded', ready: false, timestamp: Date.now() });
    }
    return { ...livePayload(), ready: true };
  });
}
