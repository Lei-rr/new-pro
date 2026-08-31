import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api } from '@/api';
import type { LogEntry, LogSearchFilter } from '@/api/types';

const LIVE_MAX = 500;

export const useLogsStore = defineStore('logs', () => {
  const results = ref<LogEntry[]>([]);
  const total = ref(0);
  const page = ref(1);
  const pageSize = ref(50);
  const currentFilter = ref<LogSearchFilter>({});

  const live = ref<LogEntry[]>([]);
  const liveEnabled = ref(true);
  const liveCount = ref(0);
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function search(filter: LogSearchFilter, targetPage = 1): Promise<void> {
    loading.value = true;
    error.value = null;
    currentFilter.value = filter;
    page.value = targetPage;
    try {
      const offset = (targetPage - 1) * pageSize.value;
      const res = await api.searchLogs({
        ...filter,
        limit: pageSize.value,
        offset,
      });
      results.value = res.data;
      total.value = res.total;
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      loading.value = false;
    }
  }

  async function fetchRecent(limit = 50, offset = 0): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const res = await api.getRecentLogs(limit, offset);
      results.value = res.data;
      total.value = res.total;
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      loading.value = false;
    }
  }

  function setPage(p: number): void {
    void search(currentFilter.value, p);
  }

  /** WS 推送实时追加 */
  function appendLive(entries: LogEntry[]): void {
    if (!liveEnabled.value || entries.length === 0) return;
    liveCount.value += entries.length;

    // 存入 live 队列
    live.value.unshift(...entries);
    if (live.value.length > LIVE_MAX) {
      live.value.length = LIVE_MAX;
    }

    // 若用户在第一页且未做复杂搜索，实时把新记录推入列表顶部
    const hasFilter = Boolean(
      currentFilter.value.q ||
        currentFilter.value.model ||
        currentFilter.value.user ||
        currentFilter.value.channel ||
        currentFilter.value.ip,
    );

    if (!hasFilter && page.value === 1) {
      results.value = [...entries, ...results.value].slice(0, pageSize.value);
      total.value += entries.length;
    }
  }

  function toggleLive(): void {
    liveEnabled.value = !liveEnabled.value;
  }

  function clearLive(): void {
    live.value = [];
    liveCount.value = 0;
  }

  return {
    results,
    total,
    page,
    pageSize,
    currentFilter,
    live,
    liveEnabled,
    liveCount,
    loading,
    error,
    search,
    fetchRecent,
    setPage,
    appendLive,
    toggleLive,
    clearLive,
  };
});
