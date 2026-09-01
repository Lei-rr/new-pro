import {
  Counter,
  Gauge,
  collectDefaultMetrics,
  register,
  prometheusContentType,
} from '@prometheus-io/client';
import type { FastifyInstance } from 'fastify';
import type { IStore } from '../store/interface.js';

const httpRequestsTotal = new Counter({
  name: 'newpro_http_requests_total',
  help: 'HTTP requests served',
  labelNames: ['method', 'status'],
});

const entriesTotal = new Gauge({
  name: 'newpro_entries_total',
  help: 'Parsed log entries currently held in memory',
});
const consumeTotal = new Gauge({
  name: 'newpro_consume_entries_total',
  help: 'Consume (billing) entries currently held in memory',
});
const activeIps = new Gauge({
  name: 'newpro_active_ips',
  help: 'Distinct active client IPs',
});
const clientGoneTotal = new Gauge({
  name: 'newpro_client_gone_total',
  help: 'Client cancellations since startup',
});
const errorRate = new Gauge({
  name: 'newpro_error_rate',
  help: 'Overall HTTP error rate',
});
const totalCost = new Gauge({
  name: 'newpro_total_cost',
  help: 'Total billed cost since startup',
});

collectDefaultMetrics({ prefix: 'newpro_' });

export function trackHttpRequest(method: string, statusCode: number): void {
  httpRequestsTotal.inc({ method, status: String(statusCode) });
}

/** Refresh business gauges from the store, then export Prometheus format. */
export function registerMetricsRoutes(app: FastifyInstance, store: IStore): void {
  app.get('/metrics', async (_request, reply) => {
    const s = store.getSummary();
    entriesTotal.set(store.getEntryCount());
    consumeTotal.set(store.getConsumeCount());
    activeIps.set(s.activeIps);
    clientGoneTotal.set(s.clientGoneCount);
    errorRate.set(s.errorRate);
    totalCost.set(s.totalCost);

    reply.header('Content-Type', prometheusContentType);
    return register.metrics();
  });
}
