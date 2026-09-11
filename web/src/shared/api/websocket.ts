import { ref, onMounted, onUnmounted } from 'vue'

export interface RealtimePulseData {
  timestamp: number
  currentTime: string
  qps: number
  rpm: number
  tpm: number
  last10sRequests: number
  last1mRequests: number
  last5mRequests: number
  activeIps1m: number
  activeUsers1m: number
  avgLatency1m: number
  successRate1m: number
  recentLogs: Array<{
    id: number
    createdAt: string
    type: number
    model: string
    channelName: string
    username: string
    ip: string
    quota: number
    totalTokens: number
    useTime: number
    status: string
  }>
}

const pulse = ref<RealtimePulseData | null>(null)
const isConnected = ref(false)

let ws: WebSocket | null = null
let reconnectTimer: any = null
let pollFallbackTimer: any = null
let activeSubscribers = 0

function connect() {
  if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) {
    return
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const wsUrl = `${protocol}//${window.location.host}/api/ws/realtime`

  try {
    ws = new WebSocket(wsUrl)

    ws.onopen = () => {
      isConnected.value = true
      if (pollFallbackTimer) {
        clearInterval(pollFallbackTimer)
        pollFallbackTimer = null
      }
    }

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.type === 'pulse' && msg.data) {
          pulse.value = msg.data
        }
      } catch (_) {}
    }

    ws.onclose = () => {
      isConnected.value = false
      ws = null
      scheduleReconnect()
    }

    ws.onerror = () => {
      isConnected.value = false
      ws?.close()
    }
  } catch (err) {
    isConnected.value = false
    scheduleReconnect()
  }
}

function scheduleReconnect() {
  if (reconnectTimer || activeSubscribers <= 0) return
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    connect()
  }, 3000)
}

export function useRealtimePulse() {
  onMounted(() => {
    activeSubscribers++
    if (activeSubscribers === 1) {
      connect()
    }
  })

  onUnmounted(() => {
    activeSubscribers = Math.max(0, activeSubscribers - 1)
    if (activeSubscribers === 0) {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer)
        reconnectTimer = null
      }
      if (ws) {
        ws.close()
        ws = null
      }
    }
  })

  return {
    pulse,
    isConnected,
  }
}
