import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api } from '@/api';
import type { LogEntry, LogFacetsResponse, LogSearchFilter } from '@/api/types';
import { PAGE_SIZE } from '@/lib/constants';
import { useAppStore } from './app';

/** 日志检索：筛选条件（带候选值）、分页、详情、实时追加 */
export const useLogsStore = defineStore('logs', () => {
  const entries = ref<LogEntry[]>([]);
  const total = ref(0);
  const offset = ref(0);
  const loading = ref(false);
  const filters = ref<LogSearchFilter>({});
  const facets = ref<LogFacetsResponse | null>(null);
  const selected = ref<LogEntry | null>(null);
  const liveEntries = ref<LogEntry[]>([]);

  const limit = PAGE_SIZE;

  async function loadFacets(): Promise<void> {
    facets.value = await api.logs.facets();
  }

  async function search(reset = true): Promise<void> {
    loading.value = true;
    try {
      if (reset) offset.value = 0;
      const app = useAppStore();
      const now = Date.now();
      const start = now - app.rangeHours * 3_600_000;
      const res = await api.logs.search({
        ...filters.value,
        start: filters.value.start ?? start,
        end: filters.value.end ?? now,
        limit,
        offset: offset.value,
      });
      entries.value = res.data;
      total.value = res.total;
    } finally {
      loading.value = false;
    }
  }

  function setFilter<K extends keyof LogSearchFilter>(key: K, value: LogSearchFilter[K]): void {
    filters.value = { ...filters.value, [key]: value || undefined };
  }

  function clearFilters(): void {
    filters.value = {};
  }

  async function goTo(page: number): Promise<void> {
    offset.value = (page - 1) * limit;
    await search(false);
  }

  function select(entry: LogEntry | null): void {
    selected.value = entry;
  }

  /** 实时日志追加（保留最近 200 条） */
  function appendLive(list: LogEntry[]): void {
    liveEntries.value = [...list, ...liveEntries.value].slice(0, 200);
  }

  return {
    entries,
    total,
    offset,
    limit,
    loading,
    filters,
    facets,
    selected,
    liveEntries,
    loadFacets,
    search,
    setFilter,
    clearFilters,
    goTo,
    select,
    appendLive,
  };
});
