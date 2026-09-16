import type { FastifyInstance } from 'fastify'
import { registerAuthRoutes } from './controllers/auth.controller.js'
import { registerAnalyticsRoutes } from './controllers/analytics.controller.js'
import { registerSystemRoutes } from './controllers/system.controller.js'

export async function registerApiRoutes(fastify: FastifyInstance): Promise<void> {
  await fastify.register(registerAuthRoutes, { prefix: '/auth' })
  await fastify.register(registerAnalyticsRoutes)
  await fastify.register(registerSystemRoutes)
}
