import type { FastifyInstance, FastifyRequest } from 'fastify'
import { loadConfig } from '../config.js'
import { createAuthGuard, safeCompare } from '../middlewares/auth.middleware.js'
import { getDashboardOverview } from '../services/metrics.js'
import { getDimensionAnalysis } from '../services/dimensions.js'
import { detectSystemRisks } from '../services/risk-detector.js'
import { getRealtimePulse } from '../services/realtime.js'
import { realtimeBroadcaster } from '../services/broadcaster.js'
import type { DimensionType, TimeRangeKey } from '../types/index.js'

export async function registerAnalyticsRoutes(fastify: FastifyInstance): Promise<void> {
  const config = loadConfig()
  const authGuard = createAuthGuard(config.jwtSecret)

  // 1. 控制台大屏概览
  fastify.get('/analytics/overview', { preHandler: authGuard }, async (req: FastifyRequest) => {
    const { range } = (req.query as { range?: TimeRangeKey }) || {}
    const validRanges: TimeRangeKey[] = ['today', '1h', '6h', '24h', '3d', '7d', '30d', 'all']
    const safeRange = range && validRanges.includes(range) ? range : 'today'
    const data = await getDashboardOverview(safeRange)
    return { success: true, data }
  })

  // 2. 多维分析 (group, user, channel, ip, model)
  fastify.get('/analytics/dimensions', { preHandler: authGuard }, async (req: FastifyRequest) => {
    const { dimension, range, limit, model, channelId, username, group } = (req.query as {
      dimension?: DimensionType
      range?: TimeRangeKey
      limit?: string
      model?: string
      channelId?: string
      username?: string
      group?: string
    }) || {}

    const validDimensions: DimensionType[] = ['group', 'user', 'channel', 'ip', 'model']
    const dim = validDimensions.includes(dimension as DimensionType) ? (dimension as DimensionType) : 'group'
    const validRanges: TimeRangeKey[] = ['today', '1h', '6h', '24h', '3d', '7d', '30d', 'all']
    const safeRange = range && validRanges.includes(range) ? range : 'today'
    const lim = Math.min(Math.max(Number(limit) || 50, 1), 200)

    const data = await getDimensionAnalysis(dim, safeRange, lim, {
      model: model?.trim() || undefined,
      channelId: channelId && !isNaN(Number(channelId)) ? Number(channelId) : undefined,
      username: username?.trim() || undefined,
      group: group?.trim() || undefined,
    })
    return { success: true, data }
  })

  // 3. 实时风险预警
  fastify.get('/analytics/risks', { preHandler: authGuard }, async (req: FastifyRequest) => {
    const { range } = (req.query as { range?: TimeRangeKey }) || {}
    const validRanges: TimeRangeKey[] = ['today', '1h', '6h', '24h', '3d', '7d', '30d', 'all']
    const safeRange = range && validRanges.includes(range) ? range : '24h'
    const data = await detectSystemRisks(safeRange)
    return { success: true, data }
  })

  // 4. 实时吞吐心跳 (HTTP 兜底)
  fastify.get('/analytics/realtime', { preHandler: authGuard }, async () => {
    const data = await getRealtimePulse()
    return { success: true, data }
  })

  // 5. WebSocket 实时双向流推送通道
  fastify.get('/ws/realtime', { websocket: true }, (socket, req) => {
    const token =
      req.cookies.auth_token ||
      req.headers.authorization?.replace(/^Bearer\s+/i, '')

    if (!token || !safeCompare(token, config.jwtSecret)) {
      socket.send(JSON.stringify({ type: 'error', message: '未授权或 Token 失效' }))
      socket.close()
      return
    }

    realtimeBroadcaster.addClient(socket as any)

    socket.on('close', () => {
      realtimeBroadcaster.removeClient(socket as any)
    })

    socket.on('error', () => {
      realtimeBroadcaster.removeClient(socket as any)
    })
  })
}
