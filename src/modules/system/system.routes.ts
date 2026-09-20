import type { FastifyInstance } from 'fastify'
import { checkDbConnection, getDbPoolStats, isDbReady } from '../../core/db.js'
import { authGuard } from '../../core/auth.js'
import { getAppVersion } from '../../shared/version.js'
import { realtimeBroadcaster } from '../../services/broadcaster.js'
import { getGeoStats } from '../../services/geoip.js'
import { RULE_CATALOG } from '../analytics/risk.service.js'

export async function registerSystemRoutes(fastify: FastifyInstance): Promise<void> {
  /** 存活探针：仅反映进程状态，永不因下游依赖抖动触发重启 */
  fastify.get(
    '/system/healthz',
    { config: { rateLimit: false } },
    async (_req, reply) => reply.status(200).send({ status: 'alive', version: getAppVersion() })
  )

  /** 就绪探针：数据库不可用时返回 503，用于流量摘除 */
  fastify.get('/system/readyz', { config: { rateLimit: false } }, async (_req, reply) => {
    const dbConnected = await checkDbConnection()
    return reply.status(dbConnected ? 200 : 503).send({
      status: dbConnected ? 'ready' : 'degraded',
      version: getAppVersion(),
      timestamp: new Date().toISOString(),
      database: dbConnected ? 'connected' : 'disconnected',
      subscribers: realtimeBroadcaster.subscriberCount,
    })
  })

  /** 运行诊断：连接池、地理库配额、缓存等内部状态（需登录） */
  fastify.get('/system/diagnostics', { preHandler: authGuard }, async (_req, reply) => {
    return reply.send({
      success: true,
      data: {
        version: getAppVersion(),
        uptimeSec: Math.round(process.uptime()),
        memoryMb: Math.round(process.memoryUsage().rss / 1048576),
        dbReady: isDbReady(),
        dbPool: getDbPoolStats(),
        subscribers: realtimeBroadcaster.subscriberCount,
        geo: getGeoStats(),
        riskRules: RULE_CATALOG,
      },
    })
  })
}
