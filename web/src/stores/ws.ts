import { defineStore } from 'pinia';
import { ref } from 'vue';
import { wsProtocols, wsUrl } from '@/api/http';
import { mapWsEntry } from '@/api/ws-mapper';
import type { LogEntry, WsMessage } from '@/api/types';
import { useOverviewStore } from './overview';
import { useLogsStore } from './logs';
import { useAlertsStore } from './alerts';

export type WsStatus = 'idle' | 'connecting' | 'open' | 'closed';

export const useWsStore = defineStore('ws', () => {
  const status = ref<WsStatus>('idle');
  const retryCount = ref(0);

  let sock: WebSocket | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function handle(msg: WsMessage): void {
    switch (msg.type) {
      case 'snapshot':
        useOverviewStore().applySummary(msg.data.summary);
        useAlertsStore().apply(msg.data.alerts);
        break;
      case 'stats_update':
        useOverviewStore().applySummary(msg.data.summary);
        useAlertsStore().apply(msg.data.alerts);
        break;
      case 'new_logs':
        useLogsStore().appendLive(
          msg.data
            .map(mapWsEntry)
            .filter((e): e is LogEntry => e !== null),
        );
        break;
      case 'alert':
        useAlertsStore().push(msg.data);
        break;
    }
  }

  function connect(): void {
    if (sock && (sock.readyState === WebSocket.OPEN || sock.readyState === WebSocket.CONNECTING)) {
      return;
    }
    status.value = 'connecting';
    const ws = new WebSocket(wsUrl(), wsProtocols());
    sock = ws;

    ws.onopen = () => {
      status.value = 'open';
      retryCount.value = 0;
    };
    ws.onmessage = (ev) => {
      try {
        handle(JSON.parse(String(ev.data)) as WsMessage);
      } catch {
        /* ignore malformed message */
      }
    };
    ws.onclose = () => {
      status.value = 'closed';
      sock = null;
      scheduleReconnect();
    };
    ws.onerror = () => {
      /* onclose follows */
    };
  }

  function scheduleReconnect(): void {
    if (timer) clearTimeout(timer);
    const delay = Math.min(1000 * 2 ** retryCount.value, 15_000);
    retryCount.value += 1;
    timer = setTimeout(() => connect(), delay);
  }

  function disconnect(): void {
    if (timer) clearTimeout(timer);
    timer = null;
    retryCount.value = 0;
    if (sock) {
      sock.onclose = null;
      sock.close();
      sock = null;
    }
    status.value = 'closed';
  }

  return { status, retryCount, connect, disconnect };
});
