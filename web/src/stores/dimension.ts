import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api } from '@/api';
import type { DimensionSort, DimensionStats, DimensionType } from '@/api/types';

const TYPES: DimensionType[] = ['model', 'channel', 'group', 'token', 'ip', 'user'];

export const useDimensionStore = defineStore('dimension', () => {
  const type = ref<DimensionType>('model');
  const sort = ref<DimensionSort>('requests');
  const data = ref<DimensionStats[]>([]);
  const total = ref(0);
  const page = ref(1);
  const pageSize = ref(20);
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function load(range?: { start?: number; end?: number }): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const offset = (page.value - 1) * pageSize.value;
      const res = await api.getDimension(type.value, {
        sort: sort.value,
        limit: pageSize.value,
        offset,
        start: range?.start,
        end: range?.end,
      });
      data.value = res.data;
      total.value = res.total;
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      loading.value = false;
    }
  }

  function setType(t: DimensionType, range?: { start?: number; end?: number }): void {
    type.value = t;
    page.value = 1;
    void load(range);
  }

  function setSort(s: DimensionSort, range?: { start?: number; end?: number }): void {
    sort.value = s;
    page.value = 1;
    void load(range);
  }

  function setPage(p: number, range?: { start?: number; end?: number }): void {
    page.value = p;
    void load(range);
  }

  return {
    types: TYPES,
    type,
    sort,
    data,
    total,
    page,
    pageSize,
    loading,
    error,
    load,
    setType,
    setSort,
    setPage,
  };
});
