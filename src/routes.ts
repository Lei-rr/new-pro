import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { loadConfig } from './config.js'
import { getDashboardOverview } from './services/metrics.js'
import { getDimensionAnalysis, type DimensionType } from './services/dimensions.js'
import { detectSystemRisks } from './services/risk-detector.js'
import { getRealtimePulse } from './services/realtime.js'
import { realtimeBroadcaster } from './services/broadcaster.js'
import type { TimeRangeKey } from './services/time-ranges.js'
import { checkDbConnection } from './db.js'

export async function registerApiRoutes(fastify: FastifyInstance) {
  const config = loadConfig()

  // 1. 认证中间件辅助
  const authGuard = async (req: FastifyRequest, reply: FastifyReply) => {
    const token = req.cookies.auth_token || req.headers.authorization?.replace(/^Bearer\s+/i, '')
    if (!token || token !== config.jwtSecret) {
      reply.status(401).send({
        success: false,
        error: '未授权或登录已过期，请重新登录',
      })
    }
  }

  // 2. 登录接口
  fastify.post('/auth/login', async (req, reply) => {
    const { username, password } = (req.body as any) || {}
    if (username === config.adminUsername && password === config.adminPasswordHash) {
      // 写入 httpOnly cookie
      reply.setCookie('auth_token', config.jwtSecret, {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 86400 * 7, // 7 days
      })

      return {
        success: true,
        data: {
          username: config.adminUsername,
          token: config.jwtSecret,
          version: '1.0.0',
        },
      }
    }

    reply.status(401).send({
      success: false,
      error: '用户名或密码不正确',
    })
  })

  // 3. 检查当前会话
  fastify.get('/auth/session', async (req, reply) => {
    const token = req.cookies.auth_token || req.headers.authorization?.replace(/^Bearer\s+/i, '')
    const authenticated = token === config.jwtSecret
    const dbOk = await checkDbConnection()

    return {
      success: true,
      data: {
        authenticated,
        username: authenticated ? config.adminUsername : null,
        dbConnected: dbOk,
        version: '1.0.0',
        pulseIntervalSec: config.pulseIntervalSec,
        calibrationIntervalSec: config.calibrationIntervalSec,
      },
    }
  })

  // 4. 退出登录 (同时支持 GET 和 POST，清除会话 cookie)
  const handleLogout = async (_req: FastifyRequest, reply: FastifyReply) => {
    reply.clearCookie('auth_token', { path: '/' })
    return { success: true, message: '已安全退出' }
  }
  fastify.post('/auth/logout', handleLogout)
  fastify.get('/auth/logout', handleLogout)

  // 5. 控制台大屏概览 API
  fastify.get('/analytics/overview', { preHandler: authGuard }, async (req) => {
    const { range } = (req.query as { range?: TimeRangeKey }) || {}
    const data = await getDashboardOverview(range || 'today')
    return {
      success: true,
      data,
    }
  })

  // 6. 多维分析 API (支持 group, user, channel, ip, model)
  fastify.get('/analytics/dimensions', { preHandler: authGuard }, async (req) => {
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
    const lim = Math.min(Math.max(Number(limit) || 50, 1), 200)

    const data = await getDimensionAnalysis(dim, range || 'today', lim, {
      model,
      channelId: channelId ? Number(channelId) : undefined,
      username,
      group,
    })
    return {
      success: true,
      data,
    }
  })

  // 7. 实时风险预警 API
  fastify.get('/analytics/risks', { preHandler: authGuard }, async (req) => {
    const { range } = (req.query as { range?: TimeRangeKey }) || {}
    const data = await detectSystemRisks(range || '24h')
    return {
      success: true,
      data,
    }
  })

  // 8. 实时吞吐量 & QPS / RPM / TPM 实时心跳 (HTTP 兜底)
  fastify.get('/analytics/realtime', { preHandler: authGuard }, async () => {
    const data = await getRealtimePulse()
    return {
      success: true,
      data,
    }
  })

  // 9. WebSocket 实时双向流推送通道 (基于全局单例广播池，N个客户端对DB仅1次查询)
  fastify.get('/ws/realtime', { websocket: true }, (socket, req) => {
    const token = req.cookies.auth_token || req.headers.authorization?.replace(/^Bearer\s+/i, '')
    if (!token || token !== config.jwtSecret) {
      socket.send(JSON.stringify({ type: 'error', message: '未授权或 Token 失效' }))
      socket.close()
      return
    }

    // 注册入单例广播器
    realtimeBroadcaster.addClient(socket as any)

    socket.on('close', () => {
      realtimeBroadcaster.removeClient(socket as any)
    })

    socket.on('error', () => {
      realtimeBroadcaster.removeClient(socket as any)
    })
  })

  // 10. 实时健康检查
  fastify.get('/system/health', async () => {
    const dbOk = await checkDbConnection()
    return {
      status: dbOk ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      database: dbOk ? 'connected' : 'disconnected',
    }
  })
}
