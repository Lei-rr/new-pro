import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api } from '@/api';
import type { Alert } from '@/api/types';

const HISTORY_MAX = 300;

export const useAlertsStore = defineStore('alerts', () => {
  const active = ref<Alert[]>([]);
  const history = ref<Alert[]>([]);
  const summaries = ref<Record<string, Record<string, unknown>>>({});
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function load(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const res = await api.getAlerts();
      summaries.value = res.summaries || {};
      apply(res.alerts);
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      loading.value = false;
    }
  }

  /** stats_update 推送当前活跃告警列表 */
  function apply(list: Alert[]): void {
    active.value = list;
    for (const a of list) {
      if (!history.value.some((h) => h.id === a.id)) {
        history.value.unshift(a);
      }
    }
    if (history.value.length > HISTORY_MAX) history.value.length = HISTORY_MAX;
  }

  /** 单条 alert 推送 */
  function push(a: Alert): void {
    if (!active.value.some((x) => x.id === a.id)) {
      active.value.unshift(a);
    }
    if (!history.value.some((h) => h.id === a.id)) {
      history.value.unshift(a);
    }
    if (history.value.length > HISTORY_MAX) history.value.length = HISTORY_MAX;
  }

  return { active, history, summaries, loading, error, load, apply, push };
});
