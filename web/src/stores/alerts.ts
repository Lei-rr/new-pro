import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api } from '@/api';
import type { Alert, AlertSeverity } from '@/api/types';

/** 告警中心：服务端严重度过滤 + 实时推送 */
export const useAlertsStore = defineStore('alerts', () => {
  const alerts = ref<Alert[]>([]);
  const summaries = ref<Record<string, Record<string, unknown>>>({});
  const severity = ref<AlertSeverity | 'all'>('all');
  const loading = ref(false);

  async function load(): Promise<void> {
    loading.value = true;
    try {
      const res = await api.alerts.get(severity.value === 'all' ? undefined : severity.value);
      alerts.value = res.alerts;
      summaries.value = res.summaries;
    } finally {
      loading.value = false;
    }
  }

  async function setSeverity(s: AlertSeverity | 'all'): Promise<void> {
    severity.value = s;
    await load();
  }

  function pushLive(alert: Alert): void {
    if (severity.value !== 'all' && alert.severity !== severity.value) return;
    alerts.value = [alert, ...alerts.value.filter((a) => a.id !== alert.id)].slice(0, 200);
  }

  return { alerts, summaries, severity, loading, load, setSeverity, pushLive };
});
