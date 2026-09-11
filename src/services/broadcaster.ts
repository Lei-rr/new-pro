import type { WebSocket } from 'ws'
import { getRealtimePulse, type RealtimePulse } from './realtime.js'
import { loadConfig } from '../config.js'

/**
 * 单例实时广播引擎 (Singleton Pulse Broadcaster)
 * 
 * 核心机制：
 * 1. 维护活跃客户端集合 Set<WebSocket>；
 * 2. 0 连接时：完全休眠，0 定时器，0 数据库查询；
 * 3. 产生连接时：启动全局唯一的 Background Timer (每 2 秒一次)；
 * 4. 单次查库聚合结果通过内存一键广播给所有活跃连接；
 * 5. 客户端全部断开时：自动销毁定时器，彻底释放数据库连接池资源。
 */
class RealtimeBroadcaster {
  private clients: Set<WebSocket> = new Set()
  private timer: NodeJS.Timeout | null = null
  private lastPulse: RealtimePulse | null = null
  private isFetching: boolean = false

  public addClient(ws: WebSocket) {
    this.clients.add(ws)

    // 新客户端接入时：若已有缓存数据先立即返回，提升体验
    if (this.lastPulse && ws.readyState === ws.OPEN) {
      try {
        ws.send(JSON.stringify({ type: 'pulse', data: this.lastPulse }))
      } catch (_) {}
    }

    // 第一个客户端连入，启动单例任务
    if (this.clients.size === 1 && !this.timer) {
      this.startLoop()
    }
  }

  public removeClient(ws: WebSocket) {
    this.clients.delete(ws)

    // 所有客户端已离开，停止轮询休眠
    if (this.clients.size === 0 && this.timer) {
      this.stopLoop()
    }
  }

  private startLoop() {
    // 立即执行一次获取最新数据
    this.tick()

    const config = loadConfig()
    const intervalMs = config.pulseIntervalSec * 1000

    this.timer = setInterval(() => {
      this.tick()
    }, intervalMs)
  }

  private stopLoop() {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  private async tick() {
    if (this.clients.size === 0) {
      this.stopLoop()
      return
    }

    // 防止慢查询堆叠重入
    if (this.isFetching) return
    this.isFetching = true

    try {
      const pulseData = await getRealtimePulse()
      this.lastPulse = pulseData

      const message = JSON.stringify({ type: 'pulse', data: pulseData })

      for (const client of this.clients) {
        if (client.readyState === client.OPEN) {
          try {
            client.send(message)
          } catch (_) {
            this.clients.delete(client)
          }
        } else if (client.readyState === client.CLOSED || client.readyState === client.CLOSING) {
          this.clients.delete(client)
        }
      }
    } catch (err) {
      console.error('[Broadcaster Error]', err)
    } finally {
      this.isFetching = false
    }
  }

  public getSubscriberCount(): number {
    return this.clients.size
  }
}

export const realtimeBroadcaster = new RealtimeBroadcaster()
