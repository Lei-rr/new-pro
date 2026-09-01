import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api } from '@/api';
import type { DimensionResponse, DimensionSort, DimensionType } from '@/api/types';
import { useAppStore } from './app';

/** 维度分析：类型切换、排序、分页（时间范围按自然日随全局） */
export const useDimensionsStore = defineStore('dimensions', () => {
  const type = ref<DimensionType>('model');
  const sort = ref<DimensionSort>('requests');
  const data = ref<DimensionResponse | null>(null);
  const loading = ref(false);
  const limit = ref(20);
  const offset = ref(0);

  async function load(): Promise<void> {
    loading.value = true;
    try {
      const app = useAppStore();
      const now = Date.now();
      // 自然日对齐：今天 00:00（本地时区）往前 N-1 天
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      const start = startOfToday.getTime() - (app.rangeDays - 1) * 86_400_000;
      data.value = await api.dimension.get(type.value, {
        sort: sort.value,
        limit: limit.value,
        offset: offset.value,
        start,
        end: now,
      });
    } finally {
      loading.value = false;
    }
  }

  async function setType(t: DimensionType): Promise<void> {
    type.value = t;
    offset.value = 0;
    await load();
  }

  async function setSort(s: DimensionSort): Promise<void> {
    sort.value = s;
    offset.value = 0;
    await load();
  }

  async function goTo(page: number): Promise<void> {
    offset.value = (page - 1) * limit.value;
    await load();
  }

  async function setPageSize(size: number): Promise<void> {
    limit.value = size;
    offset.value = 0;
    await load();
  }

  return { type, sort, data, loading, limit, offset, load, setType, setSort, goTo, setPageSize };
});
