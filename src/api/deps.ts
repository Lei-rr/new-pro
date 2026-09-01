import type { FastifyInstance } from 'fastify';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AnalyticsService } from '../service/analytics.js';
import type { AlertEngine } from '../service/alerts.js';

/** API 依赖注入容器：所有路由共享的只读服务 */
export interface ApiDeps {
  analytics: AnalyticsService;
  alerts: AlertEngine;
  isReady: () => boolean;
}

/** 路由注册函数签名 */
export type RouteRegistrar = (app: FastifyInstance, deps: ApiDeps) => void;

/** 注册一个 GET 路由（统一错误处理） */
export function registerGet(
  app: FastifyInstance,
  path: string,
  handler: (request: FastifyRequest, reply: FastifyReply, deps: ApiDeps) => Promise<unknown> | unknown,
  deps: ApiDeps,
  schema?: { querystring?: unknown },
): void {
  app.get(path, { schema }, async (request, reply) => {
    try {
      return await handler(request, reply, deps);
    } catch (err) {
      request.log.error({ err }, `route ${path} failed`);
      return reply.code(500).send({ error: 'Internal Server Error', statusCode: 500 });
    }
  });
}
