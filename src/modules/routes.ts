import type { FastifyInstance } from 'fastify'
import { registerAuthRoutes } from './auth/auth.routes.js'
import { registerAnalyticsRoutes } from './analytics/analytics.routes.js'
import { registerRealtimeRoutes } from './realtime/ws.routes.js'
import { registerSystemRoutes } from './system/system.routes.js'
import { registerMetricsRoutes } from './system/metrics.routes.js'

export async function registerApiRoutes(fastify: FastifyInstance): Promise<void> {
  await fastify.register(registerAuthRoutes, { prefix: '/auth' })
  await fastify.register(registerAnalyticsRoutes)
  await fastify.register(registerRealtimeRoutes)
  await fastify.register(registerSystemRoutes)
  await fastify.register(registerMetricsRoutes)
}
