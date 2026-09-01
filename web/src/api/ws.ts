import { wsProtocols, wsUrl } from './http';
import type { WsMessage } from './types';

/**
 * WebSocket 连接管理器：指数退避重连、心跳保活、消息类型分发。
 * 独立于 Pinia，realtime store 作为其唯一消费者。
 */
type Listener = (msg: WsMessage) => void;

export class RealtimeClient {
  private sock: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private retryCount = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private manuallyClosed = false;
  private statusListeners = new Set<(open: boolean) => void>();

  get isOpen(): boolean {
    return this.sock?.readyState === WebSocket.OPEN;
  }

  connect(): void {
    if (this.sock && (this.sock.readyState === WebSocket.OPEN || this.sock.readyState === WebSocket.CONNECTING)) {
      return;
    }
    this.manuallyClosed = false;
    const ws = new WebSocket(wsUrl(), wsProtocols());
    this.sock = ws;

    ws.onopen = () => {
      this.retryCount = 0;
      this.statusListeners.forEach((fn) => fn(true));
      this.heartbeatTimer = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping' }));
      }, 25_000);
    };

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(String(ev.data)) as WsMessage;
        this.listeners.forEach((fn) => fn(msg));
      } catch {
        /* 忽略非法消息 */
      }
    };

    ws.onclose = () => {
      this.clearTimers();
      this.statusListeners.forEach((fn) => fn(false));
      if (!this.manuallyClosed) this.scheduleReconnect();
    };

    ws.onerror = () => {
      /* onclose 随后触发 */
    };
  }

  onMessage(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** 发送客户端消息（如 range 窗口） */
  send(payload: unknown): void {
    if (this.sock?.readyState === WebSocket.OPEN) {
      this.sock.send(JSON.stringify(payload));
    }
  }

  onStatus(fn: (open: boolean) => void): () => void {
    this.statusListeners.add(fn);
    return () => this.statusListeners.delete(fn);
  }

  disconnect(): void {
    this.manuallyClosed = true;
    this.clearTimers();
    this.sock?.close();
    this.sock = null;
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    const delay = Math.min(1000 * 2 ** this.retryCount, 15_000);
    this.retryCount += 1;
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private clearTimers(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.reconnectTimer = null;
    this.heartbeatTimer = null;
  }
}
