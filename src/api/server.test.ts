import { describe, expect, it } from 'vitest';
import { createApp } from './server.js';
import { MemoryStore } from '../store/memory.js';
import { AnalysisEngine } from '../engine/registry.js';
import { EventBus } from '../core/event-bus.js';

async function buildApp(opts: { ready?: boolean } = {}) {
  const store = new MemoryStore();
  const engine = new AnalysisEngine(new EventBus(), store);
  const app = await createApp(store, engine, { isReady: () => opts.ready ?? true });
  return { app, store };
}

describe('HTTP API', () => {
  it('serves versioned liveness and readiness endpoints', async () => {
    const { app } = await buildApp();
    const live = await app.inject({ method: 'GET', url: '/api/v1/health/live' });
    expect(live.statusCode).toBe(200);
    expect(live.json().status).toBe('ok');

    const ready = await app.inject({ method: 'GET', url: '/api/v1/health/ready' });
    expect(ready.statusCode).toBe(200);
    expect(ready.json().ready).toBe(true);
    await app.close();
  });

  it('returns 503 from readiness while the ingest pipeline is starting', async () => {
    const { app } = await buildApp({ ready: false });
    const res = await app.inject({ method: 'GET', url: '/api/v1/health/ready' });
    expect(res.statusCode).toBe(503);
    expect(res.json().ready).toBe(false);
    await app.close();
  });

  it('keeps the legacy /api prefix working for existing dashboards', async () => {
    const { app } = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('ok');
    await app.close();
  });

  it('rejects invalid query params with 400 (zod validation)', async () => {
    const { app } = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/overview/summary?start=abc' });
    expect(res.statusCode).toBe(400);

    const dim = await app.inject({ method: 'GET', url: '/api/v1/dimension/bogus' });
    expect(dim.statusCode).toBe(400);
    await app.close();
  });

  it('serves overview summary and Prometheus metrics', async () => {
    const { app } = await buildApp();
    const summary = await app.inject({ method: 'GET', url: '/api/v1/overview/summary' });
    expect(summary.statusCode).toBe(200);
    expect(summary.json().totalRequests).toBe(0);

    const metrics = await app.inject({ method: 'GET', url: '/api/v1/metrics' });
    expect(metrics.statusCode).toBe(200);
    expect(metrics.headers['content-type']).toContain('text/plain');
    expect(metrics.body).toContain('newpro_http_requests_total');
    await app.close();
  });

  it('applies security headers via helmet', async () => {
    const { app } = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/health/live' });
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBeDefined();
    await app.close();
  });

  it('masks internal error details on 500 responses', async () => {
    const store = new MemoryStore();
    const broken: typeof store = new Proxy(store, {
      get(target, prop) {
        if (prop === 'getSummary') {
          return () => {
            throw new Error('secret internal stack detail');
          };
        }
        return Reflect.get(target, prop);
      },
    });
    const engine = new AnalysisEngine(new EventBus(), broken);
    const app = await createApp(broken, engine, { isReady: () => true });
    const res = await app.inject({ method: 'GET', url: '/api/v1/overview/summary' });
    expect(res.statusCode).toBe(500);
    expect(res.json().error).toBe('Internal Server Error');
    expect(res.body).not.toContain('secret internal stack detail');
    await app.close();
  });
});
