import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api } from '@/api';
import { useTimeRangeStore } from './timeRange';
import type { DimensionStats, OverviewSummary, TimelineBucket } from '@/api/types';

export const useOverviewStore = defineStore('overview', () => {
  const summary = ref<OverviewSummary | null>(null);
  const timeline = ref<TimelineBucket[]>([]);
  const modelShare = ref<DimensionStats[]>([]);
  const groupShare = ref<DimensionStats[]>([]);
  const topChannels = ref<DimensionStats[]>([]);
  const topModels = ref<DimensionStats[]>([]);
  const topIps = ref<DimensionStats[]>([]);
  const topTokens = ref<DimensionStats[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function fetchSummary(range?: { start?: number; end?: number }): Promise<void> {
    summary.value = await api.getSummary(range);
  }

  async function fetchTimeline(hours = 24): Promise<void> {
    timeline.value = await api.getTimeline(hours);
  }

  async function fetchModelShare(range?: { start?: number; end?: number }): Promise<void> {
    const res = await api.getDimension('model', {
      sort: 'tokens',
      limit: 10,
      start: range?.start,
      end: range?.end,
    });
    modelShare.value = res.data;
  }

  async function fetchGroupShare(range?: { start?: number; end?: number }): Promise<void> {
    const res = await api.getDimension('group', {
      sort: 'tokens',
      limit: 10,
      start: range?.start,
      end: range?.end,
    });
    groupShare.value = res.data;
  }

  async function fetchTopChannels(range?: { start?: number; end?: number }): Promise<void> {
    const res = await api.getDimension('channel', {
      sort: 'requests',
      limit: 5,
      start: range?.start,
      end: range?.end,
    });
    topChannels.value = res.data;
  }

  async function fetchTopModels(range?: { start?: number; end?: number }): Promise<void> {
    const res = await api.getDimension('model', {
      sort: 'cost',
      limit: 5,
      start: range?.start,
      end: range?.end,
    });
    topModels.value = res.data;
  }

  async function fetchTopIps(range?: { start?: number; end?: number }): Promise<void> {
    const res = await api.getDimension('ip', {
      sort: 'requests',
      limit: 5,
      start: range?.start,
      end: range?.end,
    });
    topIps.value = res.data;
  }

  async function fetchTopTokens(range?: { start?: number; end?: number }): Promise<void> {
    const res = await api.getDimension('token', {
      sort: 'cost',
      limit: 5,
      start: range?.start,
      end: range?.end,
    });
    topTokens.value = res.data;
  }

  async function fetchAll(opts?: { hours?: number; range?: { start?: number; end?: number } }): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      await Promise.all([
        fetchSummary(opts?.range),
        fetchTimeline(opts?.hours ?? 24),
        fetchModelShare(opts?.range),
        fetchGroupShare(opts?.range),
        fetchTopChannels(opts?.range),
        fetchTopModels(opts?.range),
        fetchTopIps(opts?.range),
        fetchTopTokens(opts?.range),
      ]);
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      loading.value = false;
    }
  }

  /** WS 推送覆盖：仅在时间范围选择【全部】时才覆盖，避免冲掉用户选择的时段过滤数据 */
  function applySummary(s: OverviewSummary): void {
    const tr = useTimeRangeStore();
    if (tr.preset === 'all') {
      summary.value = s;
    }
  }

  return {
    summary,
    timeline,
    modelShare,
    groupShare,
    topChannels,
    topModels,
    topIps,
    topTokens,
    loading,
    error,
    fetchAll,
    fetchSummary,
    fetchTimeline,
    fetchModelShare,
    fetchGroupShare,
    fetchTopChannels,
    fetchTopModels,
    fetchTopIps,
    fetchTopTokens,
    applySummary,
  };
});
