import type { FastifyInstance } from 'fastify'
import { checkDbConnection } from '../db.js'

export async function registerSystemRoutes(fastify: FastifyInstance): Promise<void> {
  // 健康检查
  fastify.get('/system/health', async () => {
    const dbOk = await checkDbConnection()
    return {
      status: dbOk ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      database: dbOk ? 'connected' : 'disconnected',
    }
  })
}
