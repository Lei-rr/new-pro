import type { WebSocket } from 'ws'
import { getConfig } from '../config.js'
import { createLogger } from '../core/logger.js'
import { getRealtimePulse } from '../modules/analytics/realtime.js'
import type { RealtimePulse } from '../modules/analytics/types.js'

const log = createLogger('broadcaster')

/** ws 的 readyState 常量（避免依赖实例属性，类型更清晰） */
const WS_OPEN = 1
const WS_CLOSING = 2
const WS_CLOSED = 3

interface ClientState {
  socket: WebSocket
  /** 上一轮心跳是否收到 pong；用于识别半开连接 */
  alive: boolean
}

/**
 * 单例广播引擎：
 * - 无订阅者时完全休眠，不产生任何数据库压力
 * - 有订阅者时全局仅一次心跳探针，广播给所有连接
 * - 每轮附带 ping，两轮无 pong 即判定为半开连接并终止
 */
class RealtimeBroadcaster {
  private readonly clients = new Map<WebSocket, ClientState>()
  private timer: NodeJS.Timeout | null = null
  private lastPulse: RealtimePulse | null = null
  private lastPulseAt = 0
  private fetching = false

  addClient(socket: WebSocket): void {
    this.clients.set(socket, { socket, alive: true })

    // 仅在缓存仍新鲜时立即回放，避免新客户端首帧收到过期数据
    if (this.lastPulse && Date.now() - this.lastPulseAt < this.freshnessMs) {
      this.sendTo(socket, this.lastPulse)
    }
    if (!this.timer && this.clients.size > 0) this.start()
  }

  removeClient(socket: WebSocket): void {
    this.clients.delete(socket)
    if (this.clients.size === 0) this.stop()
  }

  get subscriberCount(): number {
    return this.clients.size
  }

  /** 单帧数据的保鲜窗口：超过该时长的缓存不再回放 */
  private get freshnessMs(): number {
    return Math.max(2000, getConfig().pulseIntervalSec * 1000 * 2)
  }

  private start(): void {
    this.stop()
    const intervalMs = getConfig().pulseIntervalSec * 1000

    void this.tick()
    this.timer = setInterval(() => void this.tick(), intervalMs)
    this.timer.unref?.()
    log.info({ intervalMs, subscribers: this.clients.size }, 'realtime broadcast started')
  }

  private stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  private async tick(): Promise<void> {
    if (this.clients.size === 0) {
      this.stop()
      return
    }
    if (this.fetching) return
    this.fetching = true

    try {
      this.sweepDeadClients()

      if (this.clients.size === 0) {
        this.stop()
        return
      }

      const pulse = await getRealtimePulse()
      this.lastPulse = pulse
      this.lastPulseAt = Date.now()

      for (const state of this.clients.values()) {
        if (state.socket.readyState === WS_OPEN) this.sendTo(state.socket, pulse)
        else if (state.socket.readyState === WS_CLOSING || state.socket.readyState === WS_CLOSED) {
          this.clients.delete(state.socket)
        }
      }
    } catch (err) {
      log.error({ err }, 'realtime tick failed')
    } finally {
      this.fetching = false
    }
  }

  /** 通过 ping/pong 剔除半开连接，防止订阅数虚高与无效推送 */
  private sweepDeadClients(): void {
    for (const state of this.clients.values()) {
      const { socket, alive } = state

      if (!alive) {
        log.debug('terminating unresponsive client')
        this.clients.delete(socket)
        socket.terminate()
        continue
      }

      state.alive = false
      try {
        socket.ping()
      } catch {
        this.clients.delete(socket)
        socket.terminate()
      }
    }
  }

  private sendTo(socket: WebSocket, pulse: RealtimePulse): void {
    try {
      socket.send(JSON.stringify({ type: 'pulse', data: pulse }))
    } catch (err) {
      this.clients.delete(socket)
      log.warn({ err }, 'failed to push pulse, client dropped')
    }
  }

  /** 由连接建立方注册 pong 回调，标记客户端存活 */
  markAlive(socket: WebSocket): void {
    const state = this.clients.get(socket)
    if (state) state.alive = true
  }
}

export const realtimeBroadcaster = new RealtimeBroadcaster()
