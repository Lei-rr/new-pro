import type { FastifyReply } from 'fastify'

export function ok<T>(reply: FastifyReply, data: T, statusCode = 200): FastifyReply {
  return reply.status(statusCode).send({ success: true, data })
}

