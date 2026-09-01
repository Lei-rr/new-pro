import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api } from '@/api';
import type { CostAnalyticsResponse } from '@/api/types';

/** 成本分析：单次聚合请求（/cost/analytics） */
export const useCostStore = defineStore('cost', () => {
  const data = ref<CostAnalyticsResponse | null>(null);
  const loading = ref(false);

  async function load(days = 14): Promise<void> {
    loading.value = true;
    try {
      data.value = await api.cost.analytics(days);
    } finally {
      loading.value = false;
    }
  }

  return { data, loading, load };
});
