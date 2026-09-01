import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import sensible from '@fastify/sensible';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { buildLoggerOptions, createLogger } from '../core/logger.js';
import { getEnv } from '../env.js';
import { registerAuth } from './auth.js';
import type { IStore } from '../store/interface.js';
import type { AnalysisEngine } from '../engine/registry.js';
import { registerOverviewRoutes } from './routes/overview.js';
import { registerDimensionRoutes } from './routes/dimension.js';
import { registerCostRoutes } from './routes/cost.js';
import { registerLogRoutes } from './routes/logs.js';
import { registerHealthRoutes, type HealthDeps } from './routes/health.js';
import { registerAlertRoutes } from './routes/alerts.js';
import { registerMetricsRoutes, trackHttpRequest } from './metrics.js';

const log = createLogger('api');

/**
 * Route module registry: add new API domains here.
 * Route paths are version-relative (no /api prefix); modules are mounted
 * under both /api/v1 (canonical) and /api (backward compatibility).
 */
function buildRouteRegistrars(
  store: IStore,
  engine: AnalysisEngine,
  deps: HealthDeps,
): Array<(app: FastifyInstance) => void> {
  return [
    (app) => registerHealthRoutes(app, store, deps),
    (app) => registerOverviewRoutes(app, store),
    (app) => registerDimensionRoutes(app, store),
    (app) => registerCostRoutes(app, store, engine),
    (app) => registerLogRoutes(app, store),
    (app) => registerAlertRoutes(app, engine),
    (app) => registerMetricsRoutes(app, store),
  ];
}

/**
 * Create and configure the Fastify application.
 * Separated from startup for testability.
 */
export async function createApp(
  store: IStore,
  engine: AnalysisEngine,
  deps: HealthDeps = { isReady: () => true },
): Promise<FastifyInstance> {
  const env = getEnv();

  const app = Fastify({
    logger: buildLoggerOptions('api'),
    trustProxy: true,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // ─── Global plugins ───
  await app.register(sensible);
  // Dashboard is served over plain HTTP (possibly behind an injecting proxy):
  // the default CSP's `upgrade-insecure-requests` would break asset loading
  // (https upgrade on an http origin) and `script-src 'self'` would block
  // proxied inline scripts. Keep the other security headers.
  await app.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginOpenerPolicy: false,
  });
  await app.register(websocket, {
    options: {
      // Accept the 'api_key.<token>' subprotocol so the key is not exposed
      // in the URL query string (which can leak into proxy/access logs).
      handleProtocols: (protocols: Set<string>) => {
        for (const p of protocols) {
          if (p.startsWith('api_key.')) return p;
        }
        return false;
      },
    },
  });

  // CORS: explicit allowlist from env. Empty = same-origin only.
  const origins = env.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean);
  if (origins.length > 0) {
    await app.register(cors, origins.includes('*')
      ? { origin: '*' }
      : { origin: origins, credentials: true });
  }

  // Per-IP rate limiting (brute-force protection); RATE_LIMIT_MAX=0 disables.
  if (env.RATE_LIMIT_MAX > 0) {
    await app.register(rateLimit, {
      global: true,
      max: env.RATE_LIMIT_MAX,
      timeWindow: env.RATE_LIMIT_WINDOW_MS,
    });
  }

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

  // ─── Global error handler (masks internal details on 5xx) ───
  app.setErrorHandler((error: Error & { statusCode?: number }, request, reply) => {
    const statusCode = error.statusCode && error.statusCode >= 400 && error.statusCode < 600
      ? error.statusCode
      : 500;
    if (statusCode >= 500) {
      request.log.error({ err: error }, 'Request error');
    }
    reply.status(statusCode).send({
      error: statusCode >= 500 ? 'Internal Server Error' : error.message,
      statusCode,
    });
  });

  // ─── HTTP metrics counter ───
  app.addHook('onResponse', (request, reply, done) => {
    trackHttpRequest(request.method, reply.statusCode);
    done();
  });

  // ─── Register route modules (versioned) ───
  for (const register of buildRouteRegistrars(store, engine, deps)) {
    await app.register(async (scoped) => {
      register(scoped);
    }, { prefix: '/api/v1' });
    // Backward-compatible mount; remove once all clients use /api/v1.
    await app.register(async (scoped) => {
      register(scoped);
    }, { prefix: '/api' });
  }

  return app;
}
