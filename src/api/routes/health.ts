import type { FastifyInstance } from 'fastify';
import type { IStore } from '../../store/interface.js';

export function registerHealthRoutes(app: FastifyInstance, store: IStore): void {
  app.get('/api/health', async () => ({
    status: 'ok',
    uptime: process.uptime(),
    entries: store.getEntryCount(),
    consume: store.getConsumeCount(),
    memory: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    timestamp: Date.now(),
  }));
}
