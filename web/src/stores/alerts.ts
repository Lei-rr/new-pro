import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api } from '@/api';
import type { Alert, AlertSeverity } from '@/api/types';

/** 告警中心：服务端严重度过滤 */
export const useAlertsStore = defineStore('alerts', () => {
  const alerts = ref<Alert[]>([]);
  const severity = ref<AlertSeverity | 'all'>('all');
  const loading = ref(false);

  async function load(): Promise<void> {
    loading.value = true;
    try {
      const res = await api.alerts.get(severity.value === 'all' ? undefined : severity.value);
      alerts.value = res.alerts;
    } finally {
      loading.value = false;
    }
  }

  async function setSeverity(s: AlertSeverity | 'all'): Promise<void> {
    severity.value = s;
    await load();
  }

  return { alerts, severity, loading, load, setSeverity };
});
