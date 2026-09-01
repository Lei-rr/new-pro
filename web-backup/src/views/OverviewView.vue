<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import type { EChartsOption } from 'echarts';
import {
  Activity,
  ArrowUpRight,
  ChevronRight,
  Clock,
  Coins,
  Cpu,
  Database,
  Flame,
  Globe,
  Key,
  Layers,
  Radio,
  Server,
  ShieldAlert,
  Sparkles,
  Users,
  WifiOff,
  Zap,
} from 'lucide-vue-next';
import { useOverviewStore } from '@/stores/overview';
import { useDimensionStore } from '@/stores/dimension';
import { useTimeRangeStore } from '@/stores/timeRange';
import { useChartTheme } from '@/composables/chartTheme';
import { usePolling } from '@/composables/polling';
import {
  fmtCost,
  fmtDuration,
  fmtHourKey,
  fmtNumber,
  fmtPct,
  fmtTokens,
} from '@/composables/format';
import ChartCard from '@/components/ui/ChartCard.vue';
import BaseChart from '@/components/charts/BaseChart.vue';
import type { DimensionType } from '@/api/types';

const router = useRouter();
const store = useOverviewStore();
const dimStore = useDimensionStore();
const tr = useTimeRangeStore();
const ct = useChartTheme();

type ShareTab = 'model' | 'group';
const shareTab = ref<ShareTab>('model');

function refresh(): void {
  void store.fetchAll({
    hours: tr.current.hours,
    range: tr.range,
  });
}

onMounted(() => refresh());
watch(() => tr.preset, () => refresh());

// 当用户选择特定时间范围（非全部）时，每 10 秒静默轮询更新一次该时段数据
usePolling(() => {
  if (tr.preset !== 'all') {
    void store.fetchSummary(tr.range);
  }
}, 10_000);

const s = computed(() => store.summary);

// 三合一分时趋势图（请求数 + 错误数 + 成本）
const timelineOption = computed<EChartsOption>(() => ({
  tooltip: {
    trigger: 'axis',
    backgroundColor: ct.isDark.value ? '#1e293b' : '#ffffff',
    borderColor: ct.isDark.value ? '#334155' : '#e2e8f0',
    textStyle: { color: ct.isDark.value ? '#e2e8f0' : '#1e293b', fontSize: 12 },
    formatter: (params: unknown) => {
      const list = params as { name: string; seriesName: string; value: number; color: string }[];
      if (!list || !list.length) return '';
      const hour = list[0].name;
      let html = `<div class="font-bold mb-1.5 pb-1 border-b border-slate-200/50 dark:border-slate-700/50">${hour}</div>`;
      for (const p of list) {
        let val = p.value.toLocaleString();
        if (p.seriesName === '消耗成本') val = fmtCost(p.value);
        html += `<div class="flex items-center justify-between gap-6 py-0.5 text-xs">
          <span class="flex items-center gap-1.5"><span class="size-2 rounded-full" style="background:${p.color}"></span>${p.seriesName}</span>
          <span class="font-semibold tabular-nums">${val}</span>
        </div>`;
      }
      return html;
    },
  },
  legend: {
    data: ['HTTP 请求', '失败错误', '消耗成本'],
    textStyle: { color: ct.text.value },
    top: 0,
  },
  grid: { left: 48, right: 54, top: 38, bottom: 28 },
  xAxis: {
    type: 'category',
    data: store.timeline.map((t) => fmtHourKey(t.time)),
    axisLabel: { color: ct.text.value },
  },
  yAxis: [
    {
      type: 'value',
      name: '请求',
      splitLine: { lineStyle: { color: ct.grid.value, type: 'dashed' } },
      axisLabel: { color: ct.text.value },
    },
    {
      type: 'value',
      name: '成本 ($)',
      splitLine: { show: false },
      axisLabel: { color: ct.text.value, formatter: '${value}' },
    },
  ],
  series: [
    {
      name: 'HTTP 请求',
      type: 'line',
      smooth: true,
      data: store.timeline.map((t) => t.requests),
      itemStyle: { color: '#3b82f6' },
      areaStyle: {
        color: {
          type: 'linear',
          x: 0,
          y: 0,
          x2: 0,
          y2: 1,
          colorStops: [
            { offset: 0, color: 'rgba(59, 130, 246, 0.25)' },
            { offset: 1, color: 'rgba(59, 130, 246, 0.0)' },
          ],
        },
      },
    },
    {
      name: '失败错误',
      type: 'line',
      smooth: true,
      data: store.timeline.map((t) => t.errors),
      itemStyle: { color: '#f43f5e' },
    },
    {
      name: '消耗成本',
      type: 'line',
      yAxisIndex: 1,
      smooth: true,
      data: store.timeline.map((t) => Number((t.quota / 500_000).toFixed(2))),
      itemStyle: { color: '#10b981' },
    },
  ],
}));

// 模型 / 分组环形占比图
const shareOption = computed<EChartsOption>(() => {
  const isModel = shareTab.value === 'model';
  const list = isModel ? store.modelShare : store.groupShare;
  return {
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    legend: {
      orient: 'vertical',
      right: 0,
      top: 'middle',
      textStyle: { color: ct.text.value },
      formatter: (name: string) => (name.length > 14 ? name.slice(0, 13) + '…' : name),
    },
    series: [
      {
        type: 'pie',
        radius: ['45%', '72%'],
        center: ['36%', '50%'],
        data: list.map((m) => ({ name: m.key || 'default', value: m.totalTokens })),
        label: { show: false },
      },
    ],
  };
});

function navToDimension(type: DimensionType) {
  dimStore.setType(type, tr.range);
  void router.push('/dimensions');
}
</script>

<template>
  <div class="space-y-4.5">
    <!-- ═════════════════════════════════════════════════════════════════ -->
    <!-- 第 1 层：4 大高信息密度核心决策卡片                              -->
    <!-- ═════════════════════════════════════════════════════════════════ -->
    <div v-if="s" class="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
      <!-- 1. 网关流量与健康度 -->
      <div class="rounded-2xl border border-slate-200/80 bg-white p-4.5 shadow-xs transition-all hover:border-slate-300 dark:border-slate-800/80 dark:bg-[#111827] dark:hover:border-slate-700">
        <div class="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <span class="font-medium">网关流量与健康度</span>
          <div class="flex size-7.5 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
            <Activity class="size-4" />
          </div>
        </div>
        <div class="mt-2 flex items-baseline gap-2">
          <span class="text-2xl font-extrabold tracking-tight tabular-nums text-slate-800 dark:text-slate-100">
            {{ fmtNumber(s.totalRequests) }}
          </span>
          <span class="text-xs text-slate-400">HTTP 请求</span>
        </div>
        <div class="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5 text-xs dark:border-slate-800/80">
          <span class="text-slate-500 dark:text-slate-400">
            计费率: <span class="font-semibold text-slate-700 dark:text-slate-200">{{ s.totalRequests > 0 ? fmtPct(Math.min(1, s.billingRequests / s.totalRequests)) : '0%' }}</span>
            <span class="text-slate-400 font-mono"> ({{ fmtNumber(s.billingRequests) }})</span>
          </span>
          <span
            class="rounded-md border px-1.5 py-0.5 text-3xs font-semibold"
            :class="s.errorRate > 0.1 ? 'border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-400' : 'border-emerald-200 bg-emerald-50 text-emerald-600 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400'"
          >
            错误率 {{ fmtPct(s.errorRate) }}
          </span>
        </div>
      </div>

      <!-- 2. 财务成本与配额 -->
      <div class="rounded-2xl border border-slate-200/80 bg-white p-4.5 shadow-xs transition-all hover:border-slate-300 dark:border-slate-800/80 dark:bg-[#111827] dark:hover:border-slate-700">
        <div class="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <span class="font-medium">财务成本与配额</span>
          <div class="flex size-7.5 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
            <Coins class="size-4" />
          </div>
        </div>
        <div class="mt-2 flex items-baseline gap-2">
          <span class="text-2xl font-extrabold tracking-tight tabular-nums text-emerald-600 dark:text-emerald-400">
            {{ fmtCost(s.totalCost) }}
          </span>
          <span class="text-xs text-slate-400">消耗金额</span>
        </div>
        <div class="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5 text-xs dark:border-slate-800/80">
          <span class="text-slate-500 dark:text-slate-400">
            消耗配额: <span class="font-semibold text-slate-700 dark:text-slate-200">{{ fmtNumber(s.totalQuota) }}</span>
          </span>
          <span class="text-slate-500 dark:text-slate-400">
            单次均值: <span class="font-semibold text-slate-700 dark:text-slate-200">{{ s.billingRequests > 0 ? fmtCost(s.totalCost / s.billingRequests) : '$0' }}</span>
          </span>
        </div>
      </div>

      <!-- 3. Token 吞吐与缓存节省 -->
      <div class="rounded-2xl border border-slate-200/80 bg-white p-4.5 shadow-xs transition-all hover:border-slate-300 dark:border-slate-800/80 dark:bg-[#111827] dark:hover:border-slate-700">
        <div class="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <span class="font-medium">Token 吞吐与缓存节省</span>
          <div class="flex size-7.5 items-center justify-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400">
            <Zap class="size-4" />
          </div>
        </div>
        <div class="mt-2 flex items-baseline gap-2">
          <span class="text-2xl font-extrabold tracking-tight tabular-nums text-slate-800 dark:text-slate-100">
            {{ fmtTokens(s.totalPromptTokens + s.totalCompletionTokens) }}
          </span>
          <span class="text-xs text-slate-400">总 Token</span>
        </div>
        <div class="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5 text-xs dark:border-slate-800/80">
          <span class="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
            <Sparkles class="size-3.5" />
            缓存率: <span class="font-semibold">{{ fmtPct(s.cacheHitRate) }}</span>
          </span>
          <span class="text-slate-500 dark:text-slate-400">
            流式占比: <span class="font-semibold text-slate-700 dark:text-slate-200">{{ fmtPct(s.streamRatio) }}</span>
          </span>
        </div>
      </div>

      <!-- 4. 大模型体感速度与体验 -->
      <div class="rounded-2xl border border-slate-200/80 bg-white p-4.5 shadow-xs transition-all hover:border-slate-300 dark:border-slate-800/80 dark:bg-[#111827] dark:hover:border-slate-700">
        <div class="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <span class="font-medium">大模型体感延迟</span>
          <div class="flex size-7.5 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400">
            <Clock class="size-4" />
          </div>
        </div>
        <div class="mt-2 flex items-baseline gap-2">
          <span class="text-2xl font-extrabold tracking-tight tabular-nums text-indigo-600 dark:text-indigo-400">
            {{ s.avgFrt > 0 ? (s.avgFrt / 1000).toFixed(2) + 's' : '—' }}
          </span>
          <span class="text-xs text-slate-400">平均首字延迟 (FRT)</span>
        </div>
        <div class="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5 text-xs dark:border-slate-800/80">
          <span class="text-slate-500 dark:text-slate-400">
            平均生成耗时: <span class="font-semibold text-slate-700 dark:text-slate-200">{{ fmtDuration(s.avgResponseTime) }}</span>
          </span>
          <span class="text-slate-400" title="用户等待超时主动断开连接">
            取消: <span class="font-semibold text-slate-600 dark:text-slate-300">{{ s.clientGoneCount.toLocaleString() }}</span>
          </span>
        </div>
      </div>
    </div>

    <!-- ═════════════════════════════════════════════════════════════════ -->
    <!-- 第 2 层：分时复合趋势主看板 (2/3) + 资源分布环形图 (1/3)         -->
    <!-- ═════════════════════════════════════════════════════════════════ -->
    <div class="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <!-- 复合分时趋势主图 -->
      <ChartCard class="lg:col-span-2" title="分时复合趋势（请求量 · 故障数 · 消耗成本）" :loading="store.loading">
        <BaseChart :option="timelineOption" height="340px" />
      </ChartCard>

      <!-- 模型 / 租户分组环形图 -->
      <ChartCard :title="shareTab === 'model' ? '模型 Token 消耗占比 (Top 10)' : '用户组 Group 消耗占比'" :loading="store.loading">
        <template #extra>
          <div class="flex rounded-lg bg-slate-100 p-0.5 text-3xs dark:bg-slate-800">
            <button
              type="button"
              class="rounded-md px-2.5 py-0.5 font-semibold transition-all"
              :class="shareTab === 'model' ? 'bg-white text-blue-600 shadow-xs dark:bg-slate-700 dark:text-blue-400' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'"
              @click="shareTab = 'model'"
            >
              模型
            </button>
            <button
              type="button"
              class="rounded-md px-2.5 py-0.5 font-semibold transition-all"
              :class="shareTab === 'group' ? 'bg-white text-blue-600 shadow-xs dark:bg-slate-700 dark:text-blue-400' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'"
              @click="shareTab = 'group'"
            >
              分组
            </button>
          </div>
        </template>
        <BaseChart :option="shareOption" height="340px" />
      </ChartCard>
    </div>

    <!-- ═════════════════════════════════════════════════════════════════ -->
    <!-- 第 3 层：多维透视全景卡片群（客户端 IP + API Key 令牌 + 渠道监控） -->
    <!-- ═════════════════════════════════════════════════════════════════ -->
    <div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      <!-- 1. 客户端 IP 来源与安全画像 -->
      <div class="rounded-2xl border border-slate-200/80 bg-white p-4.5 shadow-xs transition-colors dark:border-slate-800/80 dark:bg-[#111827]">
        <div class="mb-3.5 flex items-center justify-between">
          <div class="flex items-center gap-2">
            <div class="flex size-6.5 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400">
              <Globe class="size-3.5" />
            </div>
            <h2 class="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-100">客户端 IP 来源画像 (Top 5)</h2>
          </div>
          <button
            type="button"
            class="flex items-center gap-0.5 text-xs font-medium text-blue-500 hover:underline"
            @click="navToDimension('ip')"
          >
            IP 详情 <ChevronRight class="size-3.5" />
          </button>
        </div>

        <div class="divide-y divide-slate-100 text-xs dark:divide-slate-800/60">
          <div
            v-for="ip in store.topIps"
            :key="ip.key"
            class="py-2.5 hover:bg-slate-50/50 dark:hover:bg-slate-800/30"
          >
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-1.5 min-w-0">
                <span class="font-mono font-semibold text-slate-800 dark:text-slate-100">
                  {{ ip.key }}
                </span>
                <span v-if="ip.location" class="rounded bg-indigo-50 px-1 py-0.2 text-3xs font-medium text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400 truncate max-w-[110px]">
                  {{ ip.location }}
                </span>
              </div>
              <span class="font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                {{ fmtCost(ip.cost) }}
              </span>
            </div>
            <div class="mt-1 flex items-center justify-between text-3xs text-slate-400">
              <span>调用: {{ fmtNumber(ip.requests) }} 次 · 延迟: {{ fmtDuration(ip.avgResponseTime) }}</span>
              <span v-if="ip.errors > 0" class="font-semibold text-rose-500">
                {{ ip.errors }} 次失败 ({{ fmtPct(ip.errors / ip.requests) }})
              </span>
              <span v-else class="text-slate-400">0 错误</span>
            </div>
            <!-- 流量占比进度条 -->
            <div class="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div
                class="h-full rounded-full bg-indigo-500"
                :style="{ width: `${store.topIps[0] ? (ip.requests / store.topIps[0].requests) * 100 : 0}%` }"
              />
            </div>
          </div>
          <div v-if="store.topIps.length === 0" class="py-8 text-center text-slate-400">暂无 IP 数据</div>
        </div>
      </div>

      <!-- 2. API Key / 令牌消耗画像 -->
      <div class="rounded-2xl border border-slate-200/80 bg-white p-4.5 shadow-xs transition-colors dark:border-slate-800/80 dark:bg-[#111827]">
        <div class="mb-3.5 flex items-center justify-between">
          <div class="flex items-center gap-2">
            <div class="flex size-6.5 items-center justify-center rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400">
              <Key class="size-3.5" />
            </div>
            <h2 class="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-100">API Key 令牌消耗画像 (Top 5)</h2>
          </div>
          <button
            type="button"
            class="flex items-center gap-0.5 text-xs font-medium text-blue-500 hover:underline"
            @click="navToDimension('token')"
          >
            令牌详情 <ChevronRight class="size-3.5" />
          </button>
        </div>

        <div class="divide-y divide-slate-100 text-xs dark:divide-slate-800/60">
          <div
            v-for="tk in store.topTokens"
            :key="tk.key"
            class="py-2.5 hover:bg-slate-50/50 dark:hover:bg-slate-800/30"
          >
            <div class="flex items-center justify-between">
              <span class="truncate font-semibold text-slate-800 dark:text-slate-100" :title="tk.key">
                {{ tk.key || 'default' }}
              </span>
              <span class="font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                {{ fmtCost(tk.cost) }}
              </span>
            </div>
            <div class="mt-1 flex items-center justify-between text-3xs text-slate-400">
              <span>调用: {{ fmtNumber(tk.requests) }} 次 · Token: {{ fmtTokens(tk.totalTokens) }}</span>
              <span>缓存: {{ tk.cacheTokens > 0 ? fmtTokens(tk.cacheTokens) : '0' }}</span>
            </div>
            <!-- 消耗占比进度条 -->
            <div class="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div
                class="h-full rounded-full bg-amber-500"
                :style="{ width: `${store.topTokens[0] && store.topTokens[0].cost > 0 ? (tk.cost / store.topTokens[0].cost) * 100 : 0}%` }"
              />
            </div>
          </div>
          <div v-if="store.topTokens.length === 0" class="py-8 text-center text-slate-400">暂无令牌数据</div>
        </div>
      </div>

      <!-- 3. 上游渠道健康度与负载监控 -->
      <div class="rounded-2xl border border-slate-200/80 bg-white p-4.5 shadow-xs transition-colors dark:border-slate-800/80 dark:bg-[#111827]">
        <div class="mb-3.5 flex items-center justify-between">
          <div class="flex items-center gap-2">
            <div class="flex size-6.5 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
              <Server class="size-3.5" />
            </div>
            <h2 class="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-100">上游渠道负载与健康度 (Top 5)</h2>
          </div>
          <button
            type="button"
            class="flex items-center gap-0.5 text-xs font-medium text-blue-500 hover:underline"
            @click="navToDimension('channel')"
          >
            渠道详情 <ChevronRight class="size-3.5" />
          </button>
        </div>

        <div class="divide-y divide-slate-100 text-xs dark:divide-slate-800/60">
          <div
            v-for="ch in store.topChannels"
            :key="ch.key"
            class="py-2.5 hover:bg-slate-50/50 dark:hover:bg-slate-800/30"
          >
            <div class="flex items-center justify-between">
              <span class="font-semibold text-slate-700 dark:text-slate-200">Channel #{{ ch.key }}</span>
              <span class="font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{{ fmtCost(ch.cost) }}</span>
            </div>
            <div class="mt-1 flex items-center justify-between gap-3">
              <div class="flex items-center gap-1 text-3xs text-slate-400">
                <span>{{ fmtNumber(ch.requests) }} 次请求</span>
                <span v-if="ch.errors > 0" class="text-rose-500 font-semibold">({{ ch.errors }} 故障)</span>
              </div>
              <div class="flex items-center gap-1.5">
                <span class="text-3xs font-medium tabular-nums text-slate-500">
                  健康度 {{ ch.requests > 0 ? fmtPct(Math.max(0, 1 - ch.errors / ch.requests), 0) : '100%' }}
                </span>
              </div>
            </div>
            <!-- 健康度进度条 -->
            <div class="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div
                class="h-full rounded-full"
                :class="
                  (ch.requests > 0 ? 1 - ch.errors / ch.requests : 1) > 0.9
                    ? 'bg-emerald-500'
                    : (ch.requests > 0 ? 1 - ch.errors / ch.requests : 1) > 0.75
                      ? 'bg-amber-500'
                      : 'bg-rose-500'
                "
                :style="{ width: `${Math.max(0, Math.min(100, (ch.requests > 0 ? 1 - ch.errors / ch.requests : 1) * 100))}%` }"
              />
            </div>
          </div>
          <div v-if="store.topChannels.length === 0" class="py-8 text-center text-slate-400">暂无渠道数据</div>
        </div>
      </div>
    </div>

    <!-- ═════════════════════════════════════════════════════════════════ -->
    <!-- 第 4 层：高消耗大模型性能矩阵                                     -->
    <!-- ═════════════════════════════════════════════════════════════════ -->
    <div class="rounded-2xl border border-slate-200/80 bg-white p-4.5 shadow-xs transition-colors dark:border-slate-800/80 dark:bg-[#111827]">
      <div class="mb-3.5 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <div class="flex size-6.5 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400">
            <Cpu class="size-3.5" />
          </div>
          <h2 class="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-100">高消耗大模型性能与成本矩阵 (Top 5)</h2>
        </div>
        <button
          type="button"
          class="flex items-center gap-0.5 text-xs font-medium text-blue-500 hover:underline"
          @click="navToDimension('model')"
        >
          全部模型详情 <ChevronRight class="size-3.5" />
        </button>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full text-left text-xs">
          <thead>
            <tr class="border-b border-slate-100 text-slate-400 dark:border-slate-800">
              <th class="pb-2.5 font-medium">模型名称</th>
              <th class="pb-2.5 text-right font-medium">请求量</th>
              <th class="pb-2.5 text-right font-medium">消耗成本</th>
              <th class="pb-2.5 text-right font-medium">总 Token</th>
              <th class="pb-2.5 text-right font-medium">Prompt 缓存</th>
              <th class="pb-2.5 text-right font-medium">平均耗时</th>
              <th class="pb-2.5 text-right font-medium">首字延迟 (FRT)</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100/70 dark:divide-slate-800/50">
            <tr v-for="m in store.topModels" :key="m.key" class="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
              <td class="max-w-[200px] truncate py-2.5 font-semibold text-slate-700 dark:text-slate-200" :title="m.key">
                {{ m.key }}
              </td>
              <td class="py-2.5 text-right tabular-nums text-slate-600 dark:text-slate-300">
                {{ fmtNumber(m.requests) }}
              </td>
              <td class="py-2.5 text-right font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                {{ fmtCost(m.cost) }}
              </td>
              <td class="py-2.5 text-right tabular-nums text-slate-600 dark:text-slate-300">
                {{ fmtTokens(m.totalTokens) }}
              </td>
              <td class="py-2.5 text-right tabular-nums text-slate-500">
                {{ m.cacheTokens > 0 ? fmtTokens(m.cacheTokens) : '—' }}
              </td>
              <td class="py-2.5 text-right tabular-nums text-slate-500">
                {{ fmtDuration(m.avgResponseTime) }}
              </td>
              <td class="py-2.5 text-right tabular-nums text-indigo-500 font-medium">
                {{ m.avgFrt > 0 ? (m.avgFrt / 1000).toFixed(2) + 's' : '—' }}
              </td>
            </tr>
            <tr v-if="store.topModels.length === 0">
              <td colspan="7" class="py-6 text-center text-slate-400">暂无模型数据</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- ═════════════════════════════════════════════════════════════════ -->
    <!-- 第 5 层：全网关活跃资产概览条                                     -->
    <!-- ═════════════════════════════════════════════════════════════════ -->
    <div
      v-if="s"
      class="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/70 px-4 py-3 text-xs text-slate-600 dark:border-slate-800/80 dark:bg-slate-900/60 dark:text-slate-300"
    >
      <div class="flex flex-wrap items-center gap-4">
        <span class="flex items-center gap-1.5 font-medium">
          <Cpu class="size-3.5 text-blue-500" />
          <span>{{ s.activeModels }} 个活跃模型</span>
        </span>
        <span class="flex items-center gap-1.5 font-medium">
          <Server class="size-3.5 text-emerald-500" />
          <span>{{ s.activeChannels }} 个可用渠道</span>
        </span>
        <span class="flex items-center gap-1.5 font-medium">
          <Users class="size-3.5 text-indigo-500" />
          <span>{{ s.activeGroups }} 个租户分组</span>
        </span>
        <span class="flex items-center gap-1.5 font-medium">
          <Globe class="size-3.5 text-indigo-500" />
          <span>{{ s.activeIps }} 个客户端 IP</span>
        </span>
        <span class="flex items-center gap-1.5 font-medium">
          <Key class="size-3.5 text-amber-500" />
          <span>{{ s.activeTokens }} 个 API Key 令牌</span>
        </span>
      </div>

      <div class="flex items-center gap-3">
        <RouterLink to="/dimensions" class="flex items-center gap-1 font-semibold text-blue-500 hover:underline">
          进入多维深度分析 <ArrowUpRight class="size-3.5" />
        </RouterLink>
      </div>
    </div>
  </div>
</template>
