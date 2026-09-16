import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { loadConfig } from '../config.js'
import { checkDbConnection } from '../db.js'
import { safeCompare } from '../middlewares/auth.middleware.js'
import { getAppVersion } from '../version.js'

export async function registerAuthRoutes(fastify: FastifyInstance): Promise<void> {
  const config = loadConfig()

  // 1. 登录
  fastify.post('/login', async (req: FastifyRequest, reply: FastifyReply) => {
    const { username, password } = (req.body as Record<string, string>) || {}

    const isUserValid = safeCompare(username, config.adminUsername)
    const isPassValid = safeCompare(password, config.adminPasswordHash)

    if (isUserValid && isPassValid) {
      reply.setCookie('auth_token', config.jwtSecret, {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 86400 * 7,
      })

      return {
        success: true,
        data: {
          username: config.adminUsername,
          token: config.jwtSecret,
          version: getAppVersion(),
        },
      }
    }

    reply.status(401).send({
      success: false,
      error: '用户名或密码不正确',
    })
  })

  // 2. 检查会话状态
  fastify.get('/session', async (req: FastifyRequest) => {
    const token =
      req.cookies.auth_token ||
      req.headers.authorization?.replace(/^Bearer\s+/i, '')

    const authenticated = safeCompare(token || '', config.jwtSecret)
    const dbOk = await checkDbConnection()

    return {
      success: true,
      data: {
        authenticated,
        username: authenticated ? config.adminUsername : null,
        dbConnected: dbOk,
        version: getAppVersion(),
        pulseIntervalSec: config.pulseIntervalSec,
        calibrationIntervalSec: config.calibrationIntervalSec,
      },
    }
  })

  // 3. 退出登录
  const handleLogout = async (_req: FastifyRequest, reply: FastifyReply) => {
    reply.clearCookie('auth_token', { path: '/' })
    return { success: true, message: '已安全退出' }
  }

  fastify.post('/logout', handleLogout)
  fastify.get('/logout', handleLogout)
}
