import type { FastifyInstance } from 'fastify';
import type { AppDeps } from '../server.js';

export function registerHealthRoutes(app: FastifyInstance, deps: AppDeps): void {
  const live = () => ({
    status: 'ok',
    uptime: process.uptime(),
    memory: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    timestamp: Date.now(),
  });

  app.get('/health', async () => live());
  app.get('/health/live', async () => live());
  app.get('/health/ready', async (_request, reply) => {
    if (!deps.isReady()) {
      return reply.code(503).send({ status: 'degraded', ready: false, timestamp: Date.now() });
    }
    return { ...live(), ready: true };
  });
}
