import type { FastifyRequest, FastifyReply } from 'fastify'
import crypto from 'node:crypto'

/**
 * 恒定时间安全字符串比对，防止时序侧信道攻击 (Timing Attack)
 */
export function safeCompare(a: string, b: string): boolean {
  if (!a || !b) return false
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) {
    return false
  }
  return crypto.timingSafeEqual(bufA, bufB)
}

export function createAuthGuard(jwtSecret: string) {
  return async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const token =
      req.cookies.auth_token ||
      req.headers.authorization?.replace(/^Bearer\s+/i, '')

    if (!token || !safeCompare(token, jwtSecret)) {
      reply.status(401).send({
        success: false,
        error: '未授权或登录已过期，请重新登录',
      })
      return
    }
  }
}
