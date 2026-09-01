import {
  Counter,
  collectDefaultMetrics,
  register,
  prometheusContentType,
} from '@prometheus-io/client';
import type { FastifyInstance } from 'fastify';

const httpRequestsTotal = new Counter({
  name: 'newpro_http_requests_total',
  help: 'HTTP requests served',
  labelNames: ['method', 'status'],
});

collectDefaultMetrics({ prefix: 'newpro_' });

export function trackHttpRequest(method: string, statusCode: number): void {
  httpRequestsTotal.inc({ method, status: String(statusCode) });
}

export function registerMetricsRoutes(app: FastifyInstance): void {
  app.get('/metrics', async (_request, reply) => {
    reply.header('Content-Type', prometheusContentType);
    return register.metrics();
  });
}
