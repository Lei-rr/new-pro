import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import sensible from '@fastify/sensible';
import fastifyStatic from '@fastify/static';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createLogger } from '../core/logger.js';
import { getEnv } from '../env.js';
import { registerAuth } from './auth.js';
import type { IStore } from '../store/interface.js';
import type { AnalysisEngine } from '../engine/registry.js';
import { registerOverviewRoutes } from './routes/overview.js';
import { registerDimensionRoutes } from './routes/dimension.js';
import { registerCostRoutes } from './routes/cost.js';
import { registerLogRoutes } from './routes/logs.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerAlertRoutes } from './routes/alerts.js';

const log = createLogger('api');

/**
 * Route module registry: add new API domains here.
 * Keeps createApp independent of concrete routes (extensible).
 */
function buildRouteRegistrars(
  store: IStore,
  engine: AnalysisEngine,
): Array<(app: FastifyInstance) => void> {
  return [
    (app) => registerHealthRoutes(app, store),
    (app) => registerOverviewRoutes(app, store),
    (app) => registerDimensionRoutes(app, store),
    (app) => registerCostRoutes(app, store, engine),
    (app) => registerLogRoutes(app, store),
    (app) => registerAlertRoutes(app, store, engine),
  ];
}

/**
 * Create and configure the Fastify application.
 * Separated from startup for testability.
 */
export async function createApp(
  store: IStore,
  engine: AnalysisEngine,
): Promise<FastifyInstance> {
  const env = getEnv();

  const app = Fastify({
    logger: false, // We use our own pino logger
    trustProxy: true,
  });

  // ─── Global plugins ───
  await app.register(sensible);
  await app.register(cors, {
    origin: true,
    credentials: true,
  });
  await app.register(websocket);

  // ─── API key auth (HTTP) ───
  registerAuth(app);

  // ─── Static frontend files (when built) ───
  const webRoot = path.resolve(process.cwd(), 'web/dist');
  let webEnabled = false;
  if (fs.existsSync(webRoot)) {
    await app.register(fastifyStatic, {
      root: webRoot,
      prefix: '/',
      index: ['index.html'],
    });
    webEnabled = true;
    log.info({ webRoot }, 'Static frontend serving enabled');
  } else {
    log.warn({ webRoot }, 'web/dist not found, static serving disabled');
  }

  // SPA fallback：前端 history 路由（如 /overview）返回 index.html
  if (webEnabled) {
    app.setNotFoundHandler((request, reply) => {
      if (request.method === 'GET' && !request.url.startsWith('/api/')) {
        return reply.sendFile('index.html');
      }
      return reply.code(404).send({ error: 'Not Found', statusCode: 404 });
    });
  }

  // ─── Global error handler ───
  app.setErrorHandler((error: Error & { statusCode?: number }, request, reply) => {
    log.error(
      { err: error, statusCode: error.statusCode, requestId: request.id },
      'Request error',
    );
    reply.status(error.statusCode ?? 500).send({
      error: error.message,
      statusCode: error.statusCode ?? 500,
    });
  });

  // ─── Request logging (production) ───
  if (env.NODE_ENV === 'production') {
    app.addHook('onResponse', (request, reply, done) => {
      log.info({
        requestId: request.id,
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
        responseTime: reply.elapsedTime,
      }, 'request');
      done();
    });
  }

  // ─── Register route modules ───
  for (const register of buildRouteRegistrars(store, engine)) {
    register(app);
  }

  return app;
}
