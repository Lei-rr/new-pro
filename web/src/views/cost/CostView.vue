<script setup lang="ts">
import { computed, onMounted } from 'vue';
import type { EChartsCoreOption } from 'echarts/core';
import { useCostStore } from '@/stores/cost';
import { formatCost, formatNumber } from '@/lib/formatters';
import StatCard from '@/components/stats/StatCard.vue';
import BaseChart from '@/components/charts/BaseChart.vue';

const store = useCostStore();

onMounted(() => store.load(30));

const trendChart = computed<EChartsCoreOption>(() => ({
  tooltip: { trigger: 'axis' },
  xAxis: {
    type: 'category',
    data: (store.data?.trend ?? []).map((t) => t.date.slice(5)),
    axisLine: { lineStyle: { color: 'transparent' } },
    axisTick: { show: false },
    axisLabel: { fontSize: 10 },
  },
  yAxis: { type: 'value', splitLine: { lineStyle: { opacity: 0.15 } }, axisLabel: { fontSize: 10 } },
  series: [
    {
      name: '成本',
      type: 'line',
      smooth: true,
      symbol: 'none',
      data: (store.data?.trend ?? []).map((t) => Number(t.cost.toFixed(4))),
      lineStyle: { width: 2 },
      areaStyle: { opacity: 0.08 },
    },
  ],
}));
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        title="总成本"
        :value="formatCost(store.data?.totalCost)"
        icon="coins"
        :hint="`${formatNumber(store.data?.totalQuota)} quota`"
        :loading="store.loading"
      />
      <StatCard
        title="今日成本"
        :value="formatCost(store.data?.todayCost)"
        icon="sparkles"
        :hint="`今日 ${formatNumber(store.data?.todayRequests)} 次请求`"
        :loading="store.loading"
      />
      <StatCard
        title="计费请求"
        :value="formatNumber(store.data?.billingRequests)"
        icon="activity"
        :loading="store.loading"
      />
      <StatCard
        title="单次均价"
        :value="formatCost(store.data?.avgCostPerRequest)"
        icon="gauge"
        :loading="store.loading"
      />
    </div>

    <Card class="gap-4 p-4">
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-sm font-semibold">每日成本趋势</h2>
          <p class="text-[11px] text-muted-foreground">近 30 天</p>
        </div>
      </div>
      <BaseChart :option="trendChart" height="280px" />
    </Card>

    <div class="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <Card class="gap-4 p-4">
        <h2 class="text-sm font-semibold">令牌消耗 Top</h2>
        <p class="text-[11px] text-muted-foreground">按 quota 排序</p>
        <div class="mt-4 flex flex-col gap-2.5">
          <div v-for="(t, i) in store.data?.tokenTop ?? []" :key="t.key" class="flex items-center gap-3">
            <span class="w-5 text-right text-xs font-medium text-muted-foreground">{{ i + 1 }}</span>
            <div class="min-w-0 flex-1">
              <div class="flex items-center justify-between gap-2">
                <span class="truncate text-xs font-medium">{{ t.key }}</span>
                <span class="text-xs tabular-nums text-muted-foreground">{{ formatCost(t.cost) }}</span>
              </div>
              <Progress
                class="mt-1 h-1.5"
                :model-value="(store.data?.tokenTop[0]?.quota ?? 0) ? (t.quota / store.data!.tokenTop[0].quota) * 100 : 0"
              />
            </div>
          </div>
        </div>
      </Card>

      <Card class="gap-4 p-4">
        <h2 class="text-sm font-semibold">模型消耗 Top</h2>
        <p class="text-[11px] text-muted-foreground">按 quota 排序</p>
        <div class="mt-4 flex flex-col gap-2.5">
          <div v-for="(m, i) in store.data?.modelTop ?? []" :key="m.key" class="flex items-center gap-3">
            <span class="w-5 text-right text-xs font-medium text-muted-foreground">{{ i + 1 }}</span>
            <div class="min-w-0 flex-1">
              <div class="flex items-center justify-between gap-2">
                <span class="truncate text-xs font-medium">{{ m.key }}</span>
                <span class="text-xs tabular-nums text-muted-foreground">{{ formatCost(m.cost) }}</span>
              </div>
              <Progress
                class="mt-1 h-1.5"
                :model-value="(store.data?.modelTop[0]?.quota ?? 0) ? (m.quota / store.data!.modelTop[0].quota) * 100 : 0"
              />
            </div>
          </div>
        </div>
      </Card>
    </div>
  </div>
</template>
