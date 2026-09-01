import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api } from '@/api';
import type { RawLogEntry, RawLogKind } from '@/api/types';
import { PAGE_SIZE } from '@/lib/constants';
import { useAppStore } from './app';

/** 原始日志流：全量展示、按状态筛选、分页 */
export const useLogsStore = defineStore('logs', () => {
  const entries = ref<RawLogEntry[]>([]);
  const total = ref(0);
  const offset = ref(0);
  const loading = ref(false);
  const kind = ref<RawLogKind>('all');
  const q = ref('');
  const selected = ref<RawLogEntry | null>(null);
  const liveEntries = ref<RawLogEntry[]>([]);

  const limit = PAGE_SIZE;

  async function search(reset = true): Promise<void> {
    loading.value = true;
    try {
      if (reset) offset.value = 0;
      const app = useAppStore();
      const now = Date.now();
      const res = await api.logs.stream({
        kind: kind.value,
        q: q.value || undefined,
        start: now - app.rangeHours * 3_600_000,
        end: now,
        limit,
        offset: offset.value,
      });
      entries.value = res.data;
      total.value = res.total;
    } finally {
      loading.value = false;
    }
  }

  async function setKind(k: RawLogKind): Promise<void> {
    kind.value = k;
    await search(true);
  }

  async function setQuery(value: string): Promise<void> {
    q.value = value;
    await search(true);
  }

  async function goTo(page: number): Promise<void> {
    offset.value = (page - 1) * limit;
    await search(false);
  }

  function select(entry: RawLogEntry | null): void {
    selected.value = entry;
  }

  /** 实时日志追加（保留最近 200 条） */
  function appendLive(list: RawLogEntry[]): void {
    liveEntries.value = [...list, ...liveEntries.value].slice(0, 200);
  }

  return {
    entries,
    total,
    offset,
    limit,
    loading,
    kind,
    q,
    selected,
    liveEntries,
    search,
    setKind,
    setQuery,
    goTo,
    select,
    appendLive,
  };
});
