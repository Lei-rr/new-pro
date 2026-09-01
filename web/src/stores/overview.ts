import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api } from '@/api';
import type { Alert, DimensionStats, OverviewSummary, TimelineBucket } from '@/api/types';
import { useAppStore } from './app';

/** 总览数据：单次聚合请求（/dashboard，自然日窗口） */
export const useOverviewStore = defineStore('overview', () => {
  const summary = ref<OverviewSummary | null>(null);
  const prevSummary = ref<OverviewSummary | null>(null);
  const timeline = ref<TimelineBucket[]>([]);
  const topModels = ref<DimensionStats[]>([]);
  const topChannels = ref<DimensionStats[]>([]);
  const topUsers = ref<DimensionStats[]>([]);
  const channelHealth = ref<Array<{ key: string; requests: number; errors: number; errorRate: number }>>([]);
  const alerts = ref<Alert[]>([]);
  const loading = ref(false);

  async function load(): Promise<void> {
    const app = useAppStore();
    loading.value = true;
    try {
      const res = await api.overview.dashboard(app.rangeDays);
      summary.value = res.summary;
      prevSummary.value = res.prevSummary;
      timeline.value = res.timeline;
      topModels.value = res.topModels;
      topChannels.value = res.topChannels;
      topUsers.value = res.topUsers;
      channelHealth.value = res.channelHealth;
      alerts.value = res.alerts;
    } finally {
      loading.value = false;
    }
  }

  /** 当前值相对上期同窗口的变化率（null 表示无上期数据） */
  function delta(field: keyof OverviewSummary): number | null {
    const cur = summary.value?.[field];
    const prev = prevSummary.value?.[field];
    if (typeof cur !== 'number' || typeof prev !== 'number' || prev === 0) return null;
    return (cur - prev) / prev;
  }

  return {
    summary, prevSummary, timeline, topModels, topChannels, topUsers,
    channelHealth, alerts, loading, load, delta,
  };
});
