import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { getConfig } from '../../config.js'
import { checkDbConnection } from '../../core/db.js'
import { issueSessionToken, isRequestAuthenticated, safeCompare } from '../../core/auth.js'
import { ok } from '../../core/http.js'
import { badRequest, unauthorized } from '../../core/http-errors.js'
import { getAppVersion } from '../../shared/version.js'

interface LoginBody {
  username?: unknown
  password?: unknown
}

export async function registerAuthRoutes(fastify: FastifyInstance): Promise<void> {
  const config = getConfig()

  fastify.post(
    '/login',
    {
      config: {
        rateLimit: {
          max: config.loginRateLimitMax,
          timeWindow: config.rateLimitWindow,
        },
      },
    },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const body = (req.body ?? {}) as LoginBody
      const username = typeof body.username === 'string' ? body.username.trim() : ''
      const password = typeof body.password === 'string' ? body.password : ''

      if (!username || !password) {
        throw badRequest('请输入用户名与密码')
      }

      const usernameMatched = safeCompare(username, config.adminUsername)
      const passwordMatched = safeCompare(password, config.adminPassword)
      if (!usernameMatched || !passwordMatched) {
        throw unauthorized('用户名或密码不正确')
      }

      // 令牌仅通过 httpOnly Cookie 下发，不回传响应体，避免被页面脚本读取
      reply.setCookie('auth_token', issueSessionToken(), {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        secure: config.cookieSecure,
        maxAge: config.sessionTtlSec,
      })

      return ok(reply, {
        username: config.adminUsername,
        version: getAppVersion(),
        dbConnected: await checkDbConnection(),
      })
    }
  )

  fastify.get('/session', async (req: FastifyRequest, reply: FastifyReply) => {
    const authenticated = isRequestAuthenticated(req)
    const dbConnected = authenticated ? await checkDbConnection() : false

    return ok(reply, {
      authenticated,
      username: authenticated ? config.adminUsername : null,
      dbConnected,
      version: getAppVersion(),
      pulseIntervalSec: config.pulseIntervalSec,
      calibrationIntervalSec: config.calibrationIntervalSec,
    })
  })

  fastify.post('/logout', async (_req: FastifyRequest, reply: FastifyReply) => {
    reply.clearCookie('auth_token', { path: '/' })
    return ok(reply, { message: '已安全退出' })
  })
}
