<script setup lang="ts">
import { computed, onMounted, watch } from 'vue';
import { Activity } from '@lucide/vue';
import type { EChartsCoreOption } from 'echarts/core';
import StatCard from '@/components/stats/StatCard.vue';
import BaseChart from '@/components/charts/BaseChart.vue';
import { useOverviewStore } from '@/stores/overview';
import { useAppStore } from '@/stores/app';
import { useRealtimeStore } from '@/stores/realtime';
import { useLogsStore } from '@/stores/logs';
import { formatCost, formatNumber, formatPercent, formatTime } from '@/lib/formatters';

const overview = useOverviewStore();
const app = useAppStore();
const realtime = useRealtimeStore();
const logs = useLogsStore();

onMounted(() => {
  overview.load();
  realtime.onLogs((entries) => logs.appendLive(entries));
});

watch(() => app.rangeHours, () => overview.load());

const s = computed(() => overview.summary);

const requestChart = computed<EChartsCoreOption>(() => ({
  tooltip: { trigger: 'axis' },
  legend: { top: 0, right: 0, itemWidth: 10, itemHeight: 10, textStyle: { fontSize: 11 } },
  xAxis: {
    type: 'category',
    data: overview.timeline.map((b) => b.time.slice(11, 16)),
    axisLine: { lineStyle: { color: 'transparent' } },
    axisTick: { show: false },
  },
  yAxis: { type: 'value', splitLine: { lineStyle: { opacity: 0.15 } } },
  series: [
    { name: '请求', type: 'bar', data: overview.timeline.map((b) => b.requests), barWidth: 6, itemStyle: { borderRadius: [3, 3, 0, 0] } },
    { name: '错误', type: 'line', smooth: true, symbol: 'none', data: overview.timeline.map((b) => b.errors), lineStyle: { width: 1.5 } },
  ],
}));

const topModels = computed(() => overview.topModels.slice(0, 5));
</script>

<template>
  <div class="flex flex-col gap-4">
    <!-- KPI 卡片 -->
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        title="请求总数"
        :value="formatNumber(s?.totalRequests)"
        icon="activity"
        :delta="overview.delta('totalRequests')"
        :hint="`计费 ${formatNumber(s?.billingRequests)} · 流式 ${formatPercent(s?.streamRatio, 1)}`"
        :loading="overview.loading"
        positive-is-good
      />
      <StatCard
        title="总成本"
        :value="formatCost(s?.totalCost)"
        icon="coins"
        :delta="overview.delta('totalCost')"
        :hint="`${formatNumber(s?.totalQuota)} quota`"
        :loading="overview.loading"
      />
      <StatCard
        title="错误率"
        :value="formatPercent(s?.errorRate)"
        icon="trendingUp"
        :delta="overview.delta('errorRate')"
        :hint="`错误 ${formatNumber(s?.errorCount)} · ERR 行 ${formatNumber(s?.errorLogCount)}`"
        :loading="overview.loading"
      />
      <StatCard
        title="活跃模型 / 用户"
        :value="`${formatNumber(s?.activeModels)} / ${formatNumber(s?.activeUsers)}`"
        icon="cpu"
        :hint="`渠道 ${formatNumber(s?.activeChannels)} · IP ${formatNumber(s?.activeIps)}`"
        :loading="overview.loading"
      />
    </div>

    <!-- 主图表：请求趋势 -->
    <Card class="gap-4 p-4">
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-sm font-semibold">请求趋势</h2>
          <p class="text-[11px] text-muted-foreground">近 {{ app.rangeHours }} 小时 · 每格 1 小时</p>
        </div>
        <div class="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span class="flex items-center gap-1.5">
            <span class="size-2 rounded-full bg-foreground" /> 请求
          </span>
          <span class="flex items-center gap-1.5">
            <span class="size-2 rounded-full bg-red-500" /> 错误
          </span>
        </div>
      </div>
      <BaseChart :option="requestChart" height="300px" />
    </Card>

    <!-- 下方双栏：Top 模型 + 实时流 -->
    <div class="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <Card class="gap-4 p-4">
        <h2 class="text-sm font-semibold">Top 模型</h2>
        <p class="text-[11px] text-muted-foreground">按请求数排序</p>
        <div v-if="overview.loading" class="mt-4 flex flex-col gap-3">
          <Skeleton v-for="i in 5" :key="i" class="h-4 w-full" />
        </div>
        <div v-else class="mt-4 flex flex-col gap-2.5">
          <div v-for="(m, i) in topModels" :key="m.key" class="flex items-center gap-3">
            <span class="w-5 text-right text-xs font-medium text-muted-foreground">{{ i + 1 }}</span>
            <div class="min-w-0 flex-1">
              <div class="flex items-center justify-between gap-2">
                <span class="truncate text-xs font-medium">{{ m.key }}</span>
                <span class="text-xs tabular-nums text-muted-foreground">{{ formatNumber(m.requests) }}</span>
              </div>
              <Progress
                class="mt-1 h-1.5"
                :model-value="overview.topModels[0]?.requests ? (m.requests / overview.topModels[0].requests) * 100 : 0"
              />
            </div>
          </div>
        </div>
      </Card>

      <Card class="gap-4 p-4">
        <div class="flex items-center justify-between">
          <h2 class="text-sm font-semibold">实时日志流</h2>
          <span class="flex items-center gap-1.5 text-[11px]" :class="realtime.connected ? 'text-emerald-500' : 'text-muted-foreground'">
            <span class="size-1.5 rounded-full bg-current" />
            {{ realtime.connected ? 'LIVE' : '离线' }}
          </span>
        </div>
        <div class="mt-3 flex h-[240px] flex-col gap-1.5 overflow-hidden font-mono text-[11px]">
          <div v-for="(l, i) in logs.liveEntries" :key="i" class="flex items-center gap-2 truncate rounded-md px-2 py-1 odd:bg-muted/40">
            <span class="text-muted-foreground">{{ formatTime(l.timestamp) }}</span>
            <span class="truncate">{{ l.model }}</span>
            <span class="ml-auto tabular-nums text-muted-foreground">{{ formatCost(l.cost) }}</span>
          </div>
          <div v-if="!logs.liveEntries.length" class="flex h-full items-center justify-center text-muted-foreground">
            <span class="flex items-center gap-2 text-xs"><Activity class="size-3.5" /> 等待新日志…</span>
          </div>
        </div>
      </Card>
    </div>
  </div>
</template>
