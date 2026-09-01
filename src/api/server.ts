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
import { loadConfig } from '../config/env.js';
import { registerAuth } from './auth.js';
import { registerMetricsRoutes, trackHttpRequest } from './metrics.js';
import type { AnalyticsService } from '../modules/analytics/analytics.service.js';
import type { LogsService } from '../modules/logs/logs.service.js';
import type { AlertsService } from '../modules/alerts/alerts.service.js';
import { registerAnalyticsRoutes } from '../modules/analytics/analytics.routes.js';
import { registerLogsRoutes } from '../modules/logs/logs.routes.js';
import { registerAlertsRoutes } from '../modules/alerts/alerts.routes.js';
import { registerHealthRoutes } from './routes/health.js';
import type { WsHub } from '../modules/live/ws.hub.js';

const log = createLogger('api');

export interface AppDeps {
  analytics: AnalyticsService;
  logs: LogsService;
  alerts: AlertsService;
  wsHub: WsHub;
  isReady: () => boolean;
}

/**
 * Fastify 组装：安全插件 + 静态前端 + 模块路由挂载。
 * 模块路由在 /api/v1（标准）与 /api（兼容）双挂载。
 */
export async function createApp(deps: AppDeps): Promise<FastifyInstance> {
  const config = loadConfig();

  const app = Fastify({
    logger: buildLoggerOptions('api'),
    trustProxy: true,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // ─── 安全插件 ───
  await app.register(sensible);
  // 面板走 HTTP（可能有注入代理）：默认 CSP 破坏资源加载，关闭
  await app.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginOpenerPolicy: false,
  });
  await app.register(websocket, {
    options: {
      handleProtocols: (protocols: Set<string>) => {
        for (const p of protocols) {
          if (p.startsWith('api_key.')) return p;
        }
        return false;
      },
    },
  });

  const origins = config.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean);
  if (origins.length > 0) {
    await app.register(cors, origins.includes('*')
      ? { origin: '*' }
      : { origin: origins, credentials: true });
  }

  if (config.RATE_LIMIT_MAX > 0) {
    await app.register(rateLimit, {
      global: true,
      max: config.RATE_LIMIT_MAX,
      timeWindow: config.RATE_LIMIT_WINDOW_MS,
    });
  }

  registerAuth(app);

  // ─── 静态前端 ───
  const webRoot = path.resolve(process.cwd(), 'web/dist');
  let webEnabled = false;
  if (fs.existsSync(webRoot)) {
    await app.register(fastifyStatic, { root: webRoot, prefix: '/', index: ['index.html'] });
    webEnabled = true;
  } else {
    log.warn({ webRoot }, 'web/dist not found, static serving disabled');
  }
  if (webEnabled) {
    app.setNotFoundHandler((request, reply) => {
      if (request.method === 'GET' && !request.url.startsWith('/api/')) {
        return reply.sendFile('index.html');
      }
      return reply.code(404).send({ error: 'Not Found', statusCode: 404 });
    });
  }

  // ─── 错误处理（5xx 掩码） ───
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

  // ─── 模块路由（版本化双挂载） ───
  const modules: Array<(scoped: FastifyInstance) => void> = [
    (scoped) => registerHealthRoutes(scoped, deps),
    (scoped) => registerAnalyticsRoutes(scoped, deps.analytics, () => deps.alerts.check() as Promise<unknown[]>),
    (scoped) => registerLogsRoutes(scoped, deps.logs),
    (scoped) => registerAlertsRoutes(scoped, deps.alerts),
    (scoped) => registerMetricsRoutes(scoped),
  ];

  for (const register of modules) {
    await app.register(async (scoped) => register(scoped), { prefix: '/api/v1' });
    await app.register(async (scoped) => register(scoped), { prefix: '/api' });
  }

  deps.wsHub.registerRoute(app);

  return app;
}
