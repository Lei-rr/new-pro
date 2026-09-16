import type { WebSocket } from 'ws'
import { getRealtimePulse } from './realtime.js'
import { loadConfig } from '../config.js'
import type { RealtimePulse } from '../types/index.js'

export class RealtimeBroadcaster {
  private clients: Set<WebSocket> = new Set()
  private timer: NodeJS.Timeout | null = null
  private lastPulse: RealtimePulse | null = null
  private isFetching: boolean = false

  public addClient(ws: WebSocket): void {
    this.clients.add(ws)

    // 新客户端连入时若已有最新数据立即下发
    if (this.lastPulse && ws.readyState === ws.OPEN) {
      try {
        ws.send(JSON.stringify({ type: 'pulse', data: this.lastPulse }))
      } catch (_) {}
    }

    if (this.clients.size === 1 && !this.timer) {
      this.startLoop()
    }
  }

  public removeClient(ws: WebSocket): void {
    this.clients.delete(ws)

    if (this.clients.size === 0 && this.timer) {
      this.stopLoop()
    }
  }

  private startLoop(): void {
    this.tick()

    const config = loadConfig()
    const intervalMs = config.pulseIntervalSec * 1000

    this.timer = setInterval(() => {
      this.tick()
    }, intervalMs)
  }

  private stopLoop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  private async tick(): Promise<void> {
    if (this.clients.size === 0) {
      this.stopLoop()
      return
    }

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
      console.error('[Broadcaster Tick Error]', err)
    } finally {
      this.isFetching = false
    }
  }

  public getSubscriberCount(): number {
    return this.clients.size
  }
}

export const realtimeBroadcaster = new RealtimeBroadcaster()
