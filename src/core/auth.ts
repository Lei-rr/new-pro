import crypto from 'node:crypto'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { getConfig } from '../config.js'
import { unauthorized } from './http-errors.js'

const TOKEN_VERSION = 'np1'

export function safeCompare(a: string, b: string): boolean {
  if (!a || !b) return false
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return crypto.timingSafeEqual(bufA, bufB)
}

function sign(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url')
}

/** 签发带过期时间的会话令牌，避免将服务端密钥直接下发给客户端 */
export function issueSessionToken(ttlSec = getConfig().sessionTtlSec): string {
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSec
  const payload = `${TOKEN_VERSION}.${expiresAt}`
  return `${payload}.${sign(payload, getConfig().sessionSecret)}`
}

export function verifySessionToken(token: string | undefined | null, nowSec = Math.floor(Date.now() / 1000)): boolean {
  if (!token) return false
  const parts = token.split('.')
  if (parts.length !== 3 || parts[0] !== TOKEN_VERSION) return false

  const expiresAt = Number(parts[1])
  if (!Number.isInteger(expiresAt) || expiresAt <= nowSec) return false

  return safeCompare(parts[2], sign(`${parts[0]}.${parts[1]}`, getConfig().sessionSecret))
}

export function extractSessionToken(req: FastifyRequest): string | undefined {
  const fromCookie = req.cookies?.auth_token
  if (typeof fromCookie === 'string' && fromCookie) return fromCookie

  const header = req.headers.authorization
  if (typeof header === 'string' && header) {
    return header.replace(/^Bearer\s+/i, '')
  }
  return undefined
}

export function isRequestAuthenticated(req: FastifyRequest): boolean {
  return verifySessionToken(extractSessionToken(req))
}

/** 需要登录的路由预处理器 */
export async function authGuard(req: FastifyRequest, _reply: FastifyReply): Promise<void> {
  if (!isRequestAuthenticated(req)) throw unauthorized()
}
