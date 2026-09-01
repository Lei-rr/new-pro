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
import type { ApiDeps } from './deps.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerDimensionRoutes } from './routes/dimension.js';
import { registerCostRoutes } from './routes/cost.js';
import { registerLogRoutes } from './routes/logs.js';
import { registerAlertRoutes } from './routes/alerts.js';
import { registerDashboardRoutes } from './routes/dashboard.js';
import { registerMetricsRoutes, trackHttpRequest } from './metrics.js';

const log = createLogger('api');

/**
 * 路由模块注册表：只依赖 ApiDeps（analytics/alerts/isReady）。
 * 挂载在 /api/v1（标准）与 /api（兼容）。
 */
function buildRouteRegistrars(deps: ApiDeps): Array<(app: FastifyInstance) => void> {
  return [
    (app) => registerHealthRoutes(app, deps),
    (app) => registerDimensionRoutes(app, deps),
    (app) => registerCostRoutes(app, deps),
    (app) => registerLogRoutes(app, deps),
    (app) => registerAlertRoutes(app, deps),
    (app) => registerDashboardRoutes(app, deps),
    (app) => registerMetricsRoutes(app),
  ];
}

/**
 * Create and configure the Fastify application.
 * Separated from startup for testability.
 */
export async function createApp(deps: ApiDeps): Promise<FastifyInstance> {
  const env = getEnv();

  const app = Fastify({
    logger: buildLoggerOptions('api'),
    trustProxy: true,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // ─── Global plugins ───
  await app.register(sensible);
  // 面板经 HTTP 提供（可能有注入代理）：默认 CSP 会破坏资源加载
  await app.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginOpenerPolicy: false,
  });
  await app.register(websocket, {
    options: {
      // 子协议携带 api_key，避免 URL 泄漏密钥
      handleProtocols: (protocols: Set<string>) => {
        for (const p of protocols) {
          if (p.startsWith('api_key.')) return p;
        }
        return false;
      },
    },
  });

  // CORS 白名单
  const origins = env.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean);
  if (origins.length > 0) {
    await app.register(cors, origins.includes('*')
      ? { origin: '*' }
      : { origin: origins, credentials: true });
  }

  // 每 IP 限流
  if (env.RATE_LIMIT_MAX > 0) {
    await app.register(rateLimit, {
      global: true,
      max: env.RATE_LIMIT_MAX,
      timeWindow: env.RATE_LIMIT_WINDOW_MS,
    });
  }

  // ─── API key auth ───
  registerAuth(app);

  // ─── 静态前端 ───
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

  // SPA fallback
  if (webEnabled) {
    app.setNotFoundHandler((request, reply) => {
      if (request.method === 'GET' && !request.url.startsWith('/api/')) {
        return reply.sendFile('index.html');
      }
      return reply.code(404).send({ error: 'Not Found', statusCode: 404 });
    });
  }

  // ─── 全局错误处理（5xx 掩码） ───
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

  // ─── HTTP metrics ───
  app.addHook('onResponse', (request, reply, done) => {
    trackHttpRequest(request.method, reply.statusCode);
    done();
  });

  // ─── 路由挂载（版本化） ───
  for (const register of buildRouteRegistrars(deps)) {
    await app.register(async (scoped) => {
      register(scoped);
    }, { prefix: '/api/v1' });
    await app.register(async (scoped) => {
      register(scoped);
    }, { prefix: '/api' });
  }

  return app;
}
