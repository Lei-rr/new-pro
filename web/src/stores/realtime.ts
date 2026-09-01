import { defineStore } from 'pinia';
import { ref } from 'vue';
import { RealtimeClient } from '@/api/ws';
import type { RawLogEntry, WsMessage } from '@/api/types';

/**
 * 实时数据分发层：唯一接触 RealtimeClient 的 store。
 * 后端 WS 仅推送日志流（统计走 REST 点击查询）。
 */
export const useRealtimeStore = defineStore('realtime', () => {
  const client = new RealtimeClient();
  const connected = ref(false);

  const logListeners = new Set<(entries: RawLogEntry[]) => void>();

  function handle(msg: WsMessage): void {
    if (msg.type === 'new_logs') {
      logListeners.forEach((fn) => fn(msg.data));
    }
  }

  const offStatus = client.onStatus((open) => (connected.value = open));
  client.onMessage(handle);

  function onLogs(fn: (entries: RawLogEntry[]) => void): () => void {
    logListeners.add(fn);
    return () => logListeners.delete(fn);
  }

  function connect(): void {
    client.connect();
  }

  function disconnect(): void {
    offStatus();
    client.disconnect();
  }

  return { connected, connect, disconnect, onLogs };
});
