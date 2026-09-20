import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { WebSocket } from 'ws'
import { createLogger } from '../../core/logger.js'
import { isRequestAuthenticated } from '../../core/auth.js'
import { realtimeBroadcaster } from '../../services/broadcaster.js'

const log = createLogger('ws')

export async function registerRealtimeRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/ws/realtime', { websocket: true }, (socket: WebSocket, req: FastifyRequest) => {
    if (!isRequestAuthenticated(req)) {
      socket.send(JSON.stringify({ type: 'error', message: '未授权或登录已过期' }))
      socket.close(4401, 'unauthorized')
      return
    }

    realtimeBroadcaster.addClient(socket)
    log.debug({ subscribers: realtimeBroadcaster.subscriberCount }, 'client connected')

    // 回应广播引擎的 ping，供其判定连接是否仍然存活
    socket.on('pong', () => realtimeBroadcaster.markAlive(socket))

    const drop = () => realtimeBroadcaster.removeClient(socket)
    socket.on('close', drop)
    socket.on('error', drop)
  })
}
