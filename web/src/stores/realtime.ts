import { defineStore } from 'pinia';
import { ref } from 'vue';
import { RealtimeClient } from '@/api/ws';
import type { Alert, OverviewSummary, RawLogEntry, WsMessage } from '@/api/types';

/**
 * WS 实时数据分发层：唯一接触 RealtimeClient 的 store。
 * 其他 store 通过事件回调订阅数据（保持单向依赖）。
 */
export const useRealtimeStore = defineStore('realtime', () => {
  const client = new RealtimeClient();
  const connected = ref(false);
  const summary = ref<OverviewSummary | null>(null);
  const alerts = ref<Alert[]>([]);

  const alertListeners = new Set<(a: Alert) => void>();
  const logListeners = new Set<(entries: RawLogEntry[]) => void>();
  const summaryListeners = new Set<(s: OverviewSummary) => void>();

  function handle(msg: WsMessage): void {
    switch (msg.type) {
      case 'snapshot':
      case 'stats_update':
        summary.value = msg.data.summary;
        alerts.value = msg.data.alerts;
        summaryListeners.forEach((fn) => fn(msg.data.summary));
        break;
      case 'alert':
        alerts.value = [...alerts.value.filter((a) => a.id !== msg.data.id), msg.data];
        alertListeners.forEach((fn) => fn(msg.data));
        break;
      case 'new_logs':
        logListeners.forEach((fn) => fn(msg.data));
        break;
    }
  }

  const offStatus = client.onStatus((open) => (connected.value = open));
  client.onMessage(handle);

  function onAlert(fn: (a: Alert) => void): () => void {
    alertListeners.add(fn);
    return () => alertListeners.delete(fn);
  }

  function onSummary(fn: (s: OverviewSummary) => void): () => void {
    summaryListeners.add(fn);
    return () => summaryListeners.delete(fn);
  }

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

  return { connected, summary, alerts, connect, disconnect, onAlert, onSummary, onLogs };
});
