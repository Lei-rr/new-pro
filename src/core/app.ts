import Fastify, { LogController, type FastifyInstance } from 'fastify'
import cors from '@fastify/cors'
import cookie from '@fastify/cookie'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import compress from '@fastify/compress'
import fastifyStatic from '@fastify/static'
import fastifyWebsocket from '@fastify/websocket'
import fs from 'node:fs'
import path from 'node:path'
import { getConfig } from '../config.js'
import { rootLogger } from './logger.js'
import { isHttpError } from './http-errors.js'
import { increment, observe } from './metrics.js'
import { registerApiRoutes } from '../modules/routes.js'

const WEB_DIST = path.resolve(process.cwd(), 'web/dist')

async function registerSecurity(fastify: FastifyInstance): Promise<void> {
  const config = getConfig()

  await fastify.register(cors, {
    origin: config.corsOrigins.length > 0 ? config.corsOrigins : false,
    credentials: true,
  })

  await fastify.register(cookie)

  await fastify.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginOpenerPolicy: false,
    crossOriginResourcePolicy: false,
    originAgentCluster: false,
  })

  await fastify.register(rateLimit, {
    global: true,
    max: config.rateLimitMax,
    timeWindow: config.rateLimitWindow,
  })

  await fastify.register(compress, { global: true })
}

async function registerStatic(fastify: FastifyInstance): Promise<boolean> {
  if (!fs.existsSync(path.join(WEB_DIST, 'index.html'))) return false

  await fastify.register(fastifyStatic, {
    root: WEB_DIST,
    prefix: '/',
    wildcard: false,
    // 构建产物文件名带内容哈希，可长期强缓存；index.html 保持协商缓存以便发版即时生效
    setHeaders(reply, filePath) {
      if (filePath.endsWith('index.html')) {
        reply.header('Cache-Control', 'no-cache')
        return
      }
      if (filePath.includes(`${path.sep}assets${path.sep}`)) {
        reply.header('Cache-Control', 'public, max-age=31536000, immutable')
      }
    },
  })
  return true
}

/**
 * 请求日志策略：
 * - 默认 LogController 会序列化完整 req/res，噪音大且可能泄露凭据
 * - 仅保留 4xx/5xx 与慢请求，避免大屏高频轮询刷爆日志
 */
class CompactLogController extends LogController {
  constructor(private readonly slowRequestMs: number) {
    super({ disableRequestLogging: false })
  }

  override incomingRequest(_request: unknown, _reply: unknown): void {
    // 不再为每个请求打点，降低 I/O 压力
  }

  /** 框架内部错误日志同样携带完整 req/res，统一压缩为最小上下文 */
  override defaultErrorLog(error: Error, request: any, reply: any): void {
    const payload = {
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      err: { message: error?.message, code: (error as { code?: string })?.code },
    }
    if ((reply.statusCode ?? 0) >= 500) request.log.error(payload, error?.message ?? 'request error')
    else request.log.warn(payload, error?.message ?? 'request rejected')
  }

  override routeNotFound(request: any): void {
    request.log.info({ method: request.method, url: request.url }, 'route not found')
  }

  override streamError(error: Error, request: any, _reply: any): void {
    request.log.warn(
      { method: request.method, url: request.url, err: { message: error?.message } },
      'response stream error'
    )
  }

  override requestCompleted(error: Error | null | undefined, request: any, reply: any): void {
    const statusCode = reply.statusCode ?? 0
    const durationMs = Math.round(reply.elapsedTime ?? 0)

    // 健康与指标端点自身不计入业务指标，避免探针流量污染
    const url: string = request.url ?? ''
    if (!url.includes('/system/health') && !url.includes('/system/readyz') && !url.includes('/system/metrics')) {
      const route = typeof request.routeOptions?.url === 'string' ? request.routeOptions.url : 'unmatched'
      increment('newpro_http_requests_total', 1, {
        method: request.method,
        route,
        status: statusCode >= 500 ? '5xx' : statusCode >= 400 ? '4xx' : '2xx',
      })
      observe('newpro_http_request_duration_ms', durationMs, { method: request.method, route })
    }

    const shouldLog =
      Boolean(error) || statusCode >= 400 || durationMs >= this.slowRequestMs || statusCode === 0

    if (!shouldLog) return

    const payload: Record<string, unknown> = {
      method: request.method,
      url: request.url,
      statusCode,
      durationMs,
    }
    if (error) payload.err = { message: error.message, stack: error.stack }

    if (statusCode >= 500 || error) request.log.error(payload, 'request failed')
    else if (statusCode >= 400) request.log.warn(payload, 'request rejected')
    else request.log.warn(payload, 'slow request')
  }
}

export async function buildApp(): Promise<FastifyInstance> {
  const config = getConfig()

  const fastify = Fastify({
    loggerInstance: rootLogger,
    trustProxy: config.trustProxy,
    bodyLimit: 256 * 1024,
    logController: new CompactLogController(3000),
  })

  await fastify.register(fastifyWebsocket)
  await registerSecurity(fastify)
  await fastify.register(registerApiRoutes, { prefix: '/api' })

  const hasStatic = await registerStatic(fastify)

  fastify.setErrorHandler((error: unknown, request, reply) => {
    if (isHttpError(error)) {
      return reply.status(error.statusCode).send({ success: false, error: error.message })
    }

    const statusCode = (error as { statusCode?: number })?.statusCode
    if (typeof statusCode === 'number' && statusCode >= 400 && statusCode < 500) {
      return reply.status(statusCode).send({
        success: false,
        error: (error as Error).message || '请求参数异常',
      })
    }

    request.log.error({ err: error }, 'unhandled request error')
    return reply.status(500).send({ success: false, error: '服务器内部错误，请稍后重试' })
  })

  fastify.setNotFoundHandler((req, reply) => {
    const url = req.raw.url ?? ''

    if (url.startsWith('/api')) {
      return reply.status(404).send({ success: false, error: '接口不存在' })
    }

    // 带扩展名的静态资源缺失时直接 404，避免把 index.html 当成 JS/图片返回给浏览器
    const pathname = url.split('?')[0]
    const lastSegment = pathname.slice(pathname.lastIndexOf('/') + 1)
    if (lastSegment.includes('.')) {
      reply.header('Cache-Control', 'no-store')
      return reply.status(404).send({ success: false, error: '资源不存在' })
    }

    if (hasStatic) return reply.sendFile('index.html')
    return reply.status(404).send({ success: false, error: '资源不存在' })
  })

  return fastify
}
