<script setup lang="ts">
import { computed, onMounted, watch } from 'vue';
import { Activity, CircleAlert, TriangleAlert } from '@lucide/vue';
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
  // 实时刷新 KPI：后端每 3s 推送一次 summary，直接更新（无额外请求）
  realtime.onSummary((s) => {
    if (overview.summary) overview.summary = s;
  });
});

watch(() => app.rangeHours, () => overview.load());

const s = computed(() => overview.summary);

const requestChart = computed<EChartsCoreOption>(() => ({
  tooltip: { trigger: 'axis' },
  xAxis: {
    type: 'category',
    data: overview.timeline.map((b) => b.time.slice(11, 16)),
    axisLine: { lineStyle: { color: 'transparent' } },
    axisTick: { show: false },
    axisLabel: { fontSize: 10 },
  },
  yAxis: { type: 'value', splitLine: { lineStyle: { opacity: 0.15 } } },
  series: [
    { name: '请求', type: 'bar', data: overview.timeline.map((b) => b.requests), barWidth: 6, itemStyle: { borderRadius: [3, 3, 0, 0] } },
    { name: '错误', type: 'line', smooth: true, symbol: 'none', data: overview.timeline.map((b) => b.errors), lineStyle: { width: 1.5 } },
  ],
}));

const topModels = computed(() => overview.topModels.slice(0, 5));
const channelHealth = computed(() => overview.channelHealth.slice(0, 5));
</script>

<template>
  <div class="flex flex-col gap-4">
    <!-- KPI 第一行 -->
    <div class="grid grid-cols-2 gap-4 xl:grid-cols-4">
      <StatCard
        title="请求总数"
        :value="formatNumber(s?.totalRequests)"
        icon="activity"
        :delta="overview.delta('totalRequests')"
        :hint="`计费 ${formatNumber(s?.billingRequests)}`"
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
        :hint="`错误 ${formatNumber(s?.errorCount)}`"
        :loading="overview.loading"
      />
      <StatCard
        title="平均响应时间"
        :value="s ? `${s.avgResponseTime.toFixed(2)}s` : '—'"
        icon="clock"
        :delta="overview.delta('avgResponseTime')"
        :hint="`平均 FRT ${s?.avgFrt ? s.avgFrt.toFixed(0) + 'ms' : '—'}`"
        :loading="overview.loading"
      />
    </div>

    <!-- KPI 第二行：LLM 效率指标 -->
    <div class="grid grid-cols-2 gap-4 xl:grid-cols-4">
      <StatCard
        title="Prompt Tokens"
        :value="formatNumber(s?.totalPromptTokens)"
        icon="sparkles"
        :hint="`补全 ${formatNumber(s?.totalCompletionTokens)}`"
        :loading="overview.loading"
        positive-is-good
      />
      <StatCard
        title="缓存命中率"
        :value="formatPercent(s?.cacheHitRate, 1)"
        icon="zap"
        :hint="`命中 ${formatNumber(s?.cacheHitTokens)} tokens`"
        :loading="overview.loading"
        positive-is-good
      />
      <StatCard
        title="流式比例"
        :value="formatPercent(s?.streamRatio, 1)"
        icon="layers"
        :loading="overview.loading"
        positive-is-good
      />
      <StatCard
        title="活跃规模"
        :value="`${formatNumber(s?.activeModels)} / ${formatNumber(s?.activeUsers)}`"
        icon="users"
        :hint="`模型/用户 · 渠道 ${formatNumber(s?.activeChannels)} · IP ${formatNumber(s?.activeIps)}`"
        :loading="overview.loading"
      />
    </div>

    <!-- 主图表 -->
    <Card class="gap-4 p-4">
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-sm font-semibold">请求趋势</h2>
          <p class="text-[11px] text-muted-foreground">近 {{ app.rangeHours }} 小时 · 每格 1 小时</p>
        </div>
        <div class="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span class="flex items-center gap-1.5"><span class="size-2 rounded-full bg-foreground" /> 请求</span>
          <span class="flex items-center gap-1.5"><span class="size-2 rounded-full bg-red-500" /> 错误</span>
        </div>
      </div>
      <BaseChart :option="requestChart" height="300px" />
    </Card>

    <!-- 三栏：Top 模型 / 渠道健康 / 实时流 -->
    <div class="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
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
              <Progress class="mt-1 h-1.5" :model-value="overview.topModels[0]?.requests ? (m.requests / overview.topModels[0].requests) * 100 : 0" />
            </div>
          </div>
        </div>
      </Card>

      <Card class="gap-4 p-4">
        <h2 class="text-sm font-semibold">渠道健康</h2>
        <p class="text-[11px] text-muted-foreground">按错误数排序</p>
        <div v-if="overview.loading" class="mt-4 flex flex-col gap-3">
          <Skeleton v-for="i in 5" :key="i" class="h-4 w-full" />
        </div>
        <div v-else class="mt-4 flex flex-col gap-2.5">
          <div v-for="c in channelHealth" :key="c.key" class="flex items-center gap-3">
            <span class="flex size-6 shrink-0 items-center justify-center rounded-md border border-border text-[10px] font-semibold">
              #{{ c.key }}
            </span>
            <div class="min-w-0 flex-1">
              <div class="flex items-center justify-between gap-2">
                <span class="text-xs tabular-nums">{{ formatNumber(c.requests) }} 请求</span>
                <span class="text-xs tabular-nums" :class="c.errors > 0 ? 'text-red-500' : 'text-emerald-500'">
                  {{ c.errors > 0 ? `${c.errors} 错误` : '正常' }}
                </span>
              </div>
              <Progress class="mt-1 h-1.5" :model-value="Math.min(100, (c.errorRate || 0) * 1000)">
                <div :class="c.errors > 0 ? 'bg-red-500' : 'bg-emerald-500'" class="h-full rounded-full transition-all" />
              </Progress>
            </div>
          </div>
          <div v-if="!channelHealth.length" class="py-6 text-center text-xs text-muted-foreground">暂无渠道数据</div>
        </div>
      </Card>

      <Card class="gap-4 p-4 lg:col-span-2 xl:col-span-1">
        <div class="flex items-center justify-between">
          <h2 class="text-sm font-semibold">实时日志流</h2>
          <span class="flex items-center gap-1.5 text-[11px]" :class="realtime.connected ? 'text-emerald-500' : 'text-muted-foreground'">
            <span class="size-1.5 rounded-full bg-current" />
            {{ realtime.connected ? 'LIVE' : '离线' }}
          </span>
        </div>
        <div class="mt-3 flex h-[220px] flex-col gap-1.5 overflow-hidden font-mono text-[11px]">
          <div v-for="(l, i) in logs.liveEntries.slice(0, 30)" :key="i" class="flex items-center gap-2 truncate rounded-md px-2 py-1 odd:bg-muted/40">
            <span class="w-14 shrink-0 text-muted-foreground">{{ formatTime(l.timestamp) }}</span>
            <span class="w-9 shrink-0 font-semibold" :class="l.success ? 'text-emerald-500' : 'text-red-500'">
              {{ l.kind === 'gin' ? (l.success ? 'OK' : 'HTTP') : l.kind === 'error' ? 'ERR' : l.level }}
            </span>
            <span class="truncate">{{ l.message }}</span>
          </div>
          <div v-if="!logs.liveEntries.length" class="flex h-full items-center justify-center text-muted-foreground">
            <span class="flex items-center gap-2 text-xs"><Activity class="size-3.5" /> 等待新日志…</span>
          </div>
        </div>
      </Card>
    </div>

    <!-- 告警速览 -->
    <Card v-if="overview.alerts.length" class="gap-4 p-4">
      <div class="flex items-center justify-between">
        <h2 class="text-sm font-semibold">告警速览</h2>
        <RouterLink to="/alerts" class="text-xs text-primary hover:underline">查看全部 →</RouterLink>
      </div>
      <div class="flex flex-col gap-2">
        <div v-for="a in overview.alerts.slice(0, 3)" :key="a.id" class="flex items-start gap-3 rounded-lg border border-border/60 px-3 py-2.5">
          <TriangleAlert v-if="a.severity === 'critical'" class="mt-0.5 size-4 shrink-0 text-red-500" />
          <CircleAlert v-else class="mt-0.5 size-4 shrink-0 text-amber-500" />
          <div class="min-w-0 flex-1">
            <p class="text-xs leading-relaxed">{{ a.message }}</p>
            <p class="mt-0.5 text-[10px] text-muted-foreground">{{ formatTime(a.timestamp) }} · {{ a.ruleId }}</p>
          </div>
        </div>
      </div>
    </Card>
  </div>
</template>
