import type { FastifyInstance, FastifyRequest } from 'fastify'
import { ok } from '../../core/http.js'
import { normalizeTimeRange } from '../../core/time-range.js'
import { parseIntClamped } from '../../core/validation.js'
import { authGuard } from '../../core/auth.js'
import { getDashboardOverview } from './overview.service.js'
import { getDimensionAnalysis } from './dimensions.service.js'
import { detectSystemRisks } from './risk.service.js'
import { getRealtimePulse } from './realtime.js'
import { DIMENSION_TYPES, type DimensionType } from './types.js'

interface RangeQuery {
  range?: string
}

interface DimensionQuery extends RangeQuery {
  dimension?: string
  limit?: string
}

function toDimension(value: unknown): DimensionType {
  return DIMENSION_TYPES.includes(value as DimensionType) ? (value as DimensionType) : 'group'
}

export async function registerAnalyticsRoutes(fastify: FastifyInstance): Promise<void> {
  await fastify.register(async (scope) => {
    scope.addHook('preHandler', authGuard)

    scope.get('/analytics/overview', async (req: FastifyRequest, reply) => {
      const { range } = (req.query ?? {}) as RangeQuery
      return ok(reply, await getDashboardOverview(normalizeTimeRange(range)))
    })

    scope.get('/analytics/dimensions', async (req: FastifyRequest, reply) => {
      const { dimension, range, limit } = (req.query ?? {}) as DimensionQuery
      const data = await getDimensionAnalysis(
        toDimension(dimension),
        normalizeTimeRange(range),
        parseIntClamped(limit, 50, 1, 200)
      )
      return ok(reply, data)
    })

    scope.get('/analytics/risks', async (req: FastifyRequest, reply) => {
      const { range } = (req.query ?? {}) as RangeQuery
      return ok(reply, await detectSystemRisks(normalizeTimeRange(range, '24h')))
    })

    scope.get('/analytics/realtime', async (_req: FastifyRequest, reply) => {
      return ok(reply, await getRealtimePulse())
    })
  })
}
