import { computed, onScopeDispose, ref } from 'vue'
import { analyticsApi } from './endpoints'
import type { RealtimePulse } from './types'

const RECONNECT_BASE_MS = 2000
const RECONNECT_MAX_MS = 30000
const FALLBACK_POLL_MS = 5000
/** 服务端在会话失效时使用的 WebSocket 关闭码 */
const WS_UNAUTHORIZED = 4401

const pulse = ref<RealtimePulse | null>(null)
const connected = ref(false)

let socket: WebSocket | null = null
let reconnectTimer: number | null = null
let fallbackTimer: number | null = null
let reconnectAttempts = 0
let subscribers = 0

function wsEndpoint(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/api/ws/realtime`
}

function publish(data: RealtimePulse): void {
  pulse.value = data
}

function stopFallback(): void {
  if (fallbackTimer !== null) {
    window.clearInterval(fallbackTimer)
    fallbackTimer = null
  }
}

function startFallback(): void {
  if (fallbackTimer !== null || subscribers <= 0) return
  fallbackTimer = window.setInterval(() => {
    void pollOnce()
  }, FALLBACK_POLL_MS)
}

async function pollOnce(): Promise<void> {
  try {
    publish(await analyticsApi.realtime())
  } catch {
    // 兜底轮询失败静默处理，等待下一次重试
  }
}

function scheduleReconnect(): void {
  if (reconnectTimer !== null || subscribers <= 0) return
  const delay = Math.min(RECONNECT_BASE_MS * 2 ** reconnectAttempts, RECONNECT_MAX_MS)
  reconnectAttempts += 1
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = null
    connect()
  }, delay)
}

function clearReconnect(): void {
  if (reconnectTimer !== null) {
    window.clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
}

function connect(): void {
  if (socket && (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN)) return

  try {
    socket = new WebSocket(wsEndpoint())
  } catch {
    scheduleReconnect()
    return
  }

  socket.onopen = () => {
    connected.value = true
    reconnectAttempts = 0
    clearReconnect()
    stopFallback()
  }

  socket.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data) as { type?: string; data?: RealtimePulse }
      if (message.type === 'pulse' && message.data) publish(message.data)
    } catch {
      // 忽略非法帧
    }
  }

  socket.onclose = (event) => {
    connected.value = false
    socket = null

    // 4401：会话已失效，重连无意义且会持续打日志，交由页面跳转登录
    if (event.code === WS_UNAUTHORIZED) {
      stopFallback()
      clearReconnect()
      return
    }

    if (subscribers > 0) {
      startFallback()
      scheduleReconnect()
    }
  }

  socket.onerror = () => {
    connected.value = false
  }
}

function teardown(): void {
  clearReconnect()
  stopFallback()
  reconnectAttempts = 0
  connected.value = false
  if (socket) {
    socket.onclose = null
    socket.onerror = null
    socket.close()
    socket = null
  }
}

/**
 * 全局共享的实时流订阅：首个订阅者建立连接，最后一个订阅者离开后释放。
 * WebSocket 断开期间自动降级为 HTTP 轮询，恢复后自动切回。
 */
export function useRealtimePulse() {
  subscribers += 1
  if (subscribers === 1) connect()

  let released = false
  onScopeDispose(() => {
    if (released) return
    released = true
    subscribers = Math.max(0, subscribers - 1)
    if (subscribers === 0) teardown()
  })

  return {
    pulse,
    isConnected: computed(() => connected.value),
  }
}

/** 页面卸载或切换登录态时强制释放连接 */
export function resetRealtimeConnection(): void {
  subscribers = 0
  teardown()
  pulse.value = null
}
