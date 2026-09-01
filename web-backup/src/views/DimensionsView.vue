<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import type { EChartsOption } from 'echarts';
import {
  BarChart3,
  CheckCircle2,
  Coins,
  Cpu,
  Database,
  Filter,
  Flame,
  Globe,
  Key,
  Layers,
  MapPin,
  Search,
  Server,
  ShieldAlert,
  Sparkles,
  Trophy,
  Users,
  Zap,
} from 'lucide-vue-next';
import { useDimensionStore } from '@/stores/dimension';
import { useTimeRangeStore } from '@/stores/timeRange';
import { useChartTheme } from '@/composables/chartTheme';
import {
  fmtCost,
  fmtDuration,
  fmtNumber,
  fmtTime,
  fmtTokens,
} from '@/composables/format';
import DataTable from '@/components/ui/DataTable.vue';
import type { Column } from '@/components/ui/DataTable.vue';
import Pagination from '@/components/ui/Pagination.vue';
import BaseChart from '@/components/charts/BaseChart.vue';
import ChartCard from '@/components/ui/ChartCard.vue';
import type { DimensionStats, DimensionSort, DimensionType } from '@/api/types';

const store = useDimensionStore();
const tr = useTimeRangeStore();
const ct = useChartTheme();

const keyword = ref('');

const TYPE_CONFIG: Record<
  DimensionType,
  { label: string; icon: typeof Cpu; desc: string; placeholder: string }
> = {
  model: {
    label: '模型分析',
    icon: Cpu,
    desc: '按大语言模型聚合用量、Token 吞吐、Prompt 缓存节省及生成延迟',
    placeholder: '搜索模型名称…',
  },
  channel: {
    label: '渠道与故障归因',
    icon: Server,
    desc: '上游渠道承接流量、成本消耗及 503/500/404 故障归因分析',
    placeholder: '搜索渠道 ID…',
  },
  group: {
    label: '分组 / 租户',
    icon: Users,
    desc: '多租户、业务线与用户分组（Group）维度的成本分摊与配额消耗',
    placeholder: '搜索分组名称…',
  },
  ip: {
    label: '客户端 IP',
    icon: Globe,
    desc: '访问频次最高与成本最大的客户端来源 IP、物理归属地与异常分析',
    placeholder: '搜索 IP 地址…',
  },
  token: {
    label: 'API Key 令牌',
    icon: Key,
    desc: 'API Key 令牌调用画像、配额消耗与高额调用排查',
    placeholder: '搜索令牌名称…',
  },
  user: {
    label: '用户维度',
    icon: Users,
    desc: '平台注册用户的调用量、总成本与活跃状态',
    placeholder: '搜索用户 ID…',
  },
};

const SORT_OPTIONS: { value: DimensionSort; label: string }[] = [
  { value: 'cost', label: '按消耗成本 ($)' },
  { value: 'requests', label: '按请求量' },
  { value: 'tokens', label: '按 Token 规模' },
  { value: 'errors', label: '按故障/错误数' },
  { value: 'frt', label: '按首字延迟 (FRT)' },
];

function refresh(): void {
  void store.load(tr.range);
}

onMounted(() => refresh());
watch(() => tr.preset, () => {
  store.page = 1;
  refresh();
});

// 过滤本地关键词
const filteredData = computed(() => {
  if (!keyword.value.trim()) return store.data;
  const kw = keyword.value.trim().toLowerCase();
  return store.data.filter(
    (d) => (d.key || '').toLowerCase().includes(kw) || (d.location || '').toLowerCase().includes(kw),
  );
});

// 计算当前维度聚合统计
const dimensionSummary = computed(() => {
  let totalCost = 0;
  let totalTokens = 0;
  let totalRequests = 0;
  let totalErrors = 0;
  for (const d of store.data) {
    totalCost += d.cost;
    totalTokens += d.totalTokens;
    totalRequests += d.requests;
    totalErrors += d.errors;
  }
  const top1 = store.data[0];
  return {
    count: store.total,
    totalCost,
    totalTokens,
    totalRequests,
    totalErrors,
    top1Key: top1 ? top1.key || 'default' : '—',
    top1Cost: top1 ? top1.cost : 0,
  };
});

const columns = computed<Column<DimensionStats>[]>(() => {
  const cols: Column<DimensionStats>[] = [
    {
      key: 'key',
      label: TYPE_CONFIG[store.type].label.replace('分析', '').replace('维度', ''),
      format: (r) => {
        if (store.type === 'channel') return `Channel #${r.key}`;
        if (store.type === 'ip' && r.location) return `${r.key} (${r.location})`;
        return r.key || 'default';
      },
    },
  ];

  if (store.type === 'ip') {
    cols.push({
      key: 'location' as any,
      label: 'IP 物理归属地',
      format: (r) => r.location || '未知',
    });
  }

  cols.push(
    {
      key: 'cost',
      label: '消耗成本 ($)',
      align: 'right',
      format: (r) => fmtCost(r.cost),
    },
    {
      key: 'requests',
      label: '请求量',
      align: 'right',
      format: (r) => fmtNumber(r.requests),
    },
    {
      key: 'totalTokens',
      label: '总 Token',
      align: 'right',
      format: (r) => fmtTokens(r.totalTokens),
    },
    {
      key: 'cacheTokens',
      label: 'Prompt 缓存',
      align: 'right',
      format: (r) => (r.cacheTokens > 0 ? fmtTokens(r.cacheTokens) : '—'),
    },
    {
      key: 'errors',
      label: '故障 / 错误',
      align: 'right',
      format: (r) => (r.errors > 0 ? `${r.errors}` : '0'),
    },
    {
      key: 'avgResponseTime',
      label: '平均耗时',
      align: 'right',
      format: (r) => fmtDuration(r.avgResponseTime),
    },
    {
      key: 'avgFrt',
      label: '首字耗时 (FRT)',
      align: 'right',
      format: (r) => (r.avgFrt > 0 ? `${(r.avgFrt / 1000).toFixed(2)}s` : '—'),
    },
    {
      key: 'lastSeen',
      label: '最后活跃',
      align: 'right',
      format: (r) => fmtTime(r.lastSeen),
    },
  );

  return cols;
});

// 动态透视条形图
const barOption = computed<EChartsOption>(() => {
  const top = [...filteredData.value].slice(0, 10).reverse();
  const sortKey = store.sort === 'tokens' ? 'totalTokens' : store.sort === 'cost' ? 'cost' : store.sort === 'frt' ? 'avgFrt' : store.sort;

  return {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      backgroundColor: ct.isDark.value ? '#1e293b' : '#ffffff',
      borderColor: ct.isDark.value ? '#334155' : '#e2e8f0',
      textStyle: { color: ct.isDark.value ? '#e2e8f0' : '#1e293b', fontSize: 12 },
      formatter: (params: unknown) => {
        const list = params as { name: string; dataIndex: number }[];
        if (!list || !list.length) return '';
        const item = top[list[0].dataIndex];
        if (!item) return '';
        let titleName = store.type === 'channel' ? `Channel #${item.key}` : item.key || 'default';
        if (store.type === 'ip' && item.location) {
          titleName += ` (${item.location})`;
        }
        return `
          <div class="font-medium mb-1.5 pb-1 border-b border-slate-200/50 dark:border-slate-700/50">${titleName}</div>
          <div class="text-xs space-y-1">
            <div class="flex justify-between gap-5 text-slate-500 dark:text-slate-400"><span>消耗成本:</span> <span class="font-medium text-emerald-600 dark:text-emerald-400 tabular-nums">${fmtCost(item.cost)}</span></div>
            <div class="flex justify-between gap-5 text-slate-500 dark:text-slate-400"><span>请求次数:</span> <span class="font-medium text-slate-800 dark:text-slate-100 tabular-nums">${item.requests.toLocaleString()} 次</span></div>
            <div class="flex justify-between gap-5 text-slate-500 dark:text-slate-400"><span>总 Token:</span> <span class="font-medium text-slate-800 dark:text-slate-100 tabular-nums">${fmtTokens(item.totalTokens)}</span></div>
            <div class="flex justify-between gap-5 text-slate-500 dark:text-slate-400"><span>Prompt 缓存:</span> <span class="font-medium text-emerald-600 dark:text-emerald-400 tabular-nums">${item.cacheTokens > 0 ? fmtTokens(item.cacheTokens) : '0'}</span></div>
            <div class="flex justify-between gap-5 text-slate-500 dark:text-slate-400"><span>配额 Quota:</span> <span class="font-medium tabular-nums">${fmtNumber(item.quota)}</span></div>
            <div class="flex justify-between gap-5 text-slate-500 dark:text-slate-400"><span>故障 / 错误:</span> <span class="font-medium tabular-nums ${item.errors > 0 ? 'text-rose-500' : ''}">${item.errors} 次</span></div>
            <div class="flex justify-between gap-5 text-slate-500 dark:text-slate-400"><span>平均生成耗时:</span> <span class="font-medium tabular-nums">${fmtDuration(item.avgResponseTime)}</span></div>
            ${item.avgFrt > 0 ? `<div class="flex justify-between gap-5 text-slate-500 dark:text-slate-400"><span>首字延迟 (FRT):</span> <span class="font-medium tabular-nums text-indigo-500">${(item.avgFrt / 1000).toFixed(2)}s</span></div>` : ''}
          </div>
        `;
      },
    },
    grid: { left: 16, right: 28, top: 16, bottom: 16, containLabel: true },
    xAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: ct.grid.value } },
      axisLabel: {
        color: ct.text.value,
        formatter: (val: number) => {
          if (store.sort === 'cost') return `$${val}`;
          if (store.sort === 'frt') return `${(val / 1000).toFixed(1)}s`;
          return fmtNumber(val);
        },
      },
    },
    yAxis: {
      type: 'category',
      data: top.map((d) => (store.type === 'channel' ? `#${d.key}` : d.key || 'default')),
      axisLabel: {
        color: ct.text.value,
        formatter: (name: string) => (name.length > 18 ? name.slice(0, 17) + '…' : name),
      },
    },
    series: [
      {
        name: SORT_OPTIONS.find((o) => o.value === store.sort)?.label ?? '数值',
        type: 'bar',
        data: top.map((d) => {
          if (sortKey === 'cost') return Number(d.cost.toFixed(2));
          return (d as any)[sortKey];
        }),
        itemStyle: {
          color:
            store.sort === 'errors'
              ? '#f43f5e'
              : store.sort === 'cost'
                ? '#10b981'
                : store.sort === 'tokens'
                  ? '#8b5cf6'
                  : store.sort === 'frt'
                    ? '#6366f1'
                    : '#3b82f6',
          borderRadius: [0, 4, 4, 0],
        },
      },
    ],
  };
});

// Top 5 成本占比环形图
const donutOption = computed<EChartsOption>(() => {
  const list = [...filteredData.value].slice(0, 5);
  return {
    tooltip: { trigger: 'item', formatter: '{b}: ${c} ({d}%)' },
    legend: {
      orient: 'vertical',
      right: 0,
      top: 'middle',
      textStyle: { color: ct.text.value, fontSize: 11 },
      formatter: (name: string) => (name.length > 12 ? name.slice(0, 11) + '…' : name),
    },
    series: [
      {
        type: 'pie',
        radius: ['45%', '72%'],
        center: ['35%', '50%'],
        data: list.map((m) => ({
          name: store.type === 'channel' ? `Channel #${m.key}` : m.key || 'default',
          value: Number(m.cost.toFixed(2)),
        })),
        label: { show: false },
      },
    ],
  };
});
</script>

<template>
  <div class="space-y-4.5">
    <!-- ═════════════════════════════════════════════════════════════════ -->
    <!-- 第 1 层：6 大聚合维度切换 Tab + 排序与搜索控制栏                 -->
    <!-- ═════════════════════════════════════════════════════════════════ -->
    <div class="flex flex-wrap items-center justify-between gap-3">
      <!-- 维度切换 Tab -->
      <div class="flex flex-wrap items-center gap-1.5 rounded-xl border border-slate-200/80 bg-white p-1 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <button
          v-for="t in store.types"
          :key="t"
          type="button"
          class="flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all"
          :class="
            store.type === t
              ? 'bg-blue-500 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
          "
          @click="store.setType(t, tr.range)"
        >
          <component :is="TYPE_CONFIG[t].icon" class="size-3.5" />
          <span>{{ TYPE_CONFIG[t].label }}</span>
        </button>
      </div>

      <!-- 右侧：搜索与指标排序 -->
      <div class="flex flex-wrap items-center gap-2">
        <div class="relative">
          <Search class="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
          <input
            v-model="keyword"
            type="text"
            :placeholder="TYPE_CONFIG[store.type].placeholder"
            class="h-8.5 w-44 rounded-lg border border-slate-200 bg-white pl-8 pr-3 text-xs text-slate-700 placeholder-slate-400 focus:border-blue-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          />
        </div>

        <div class="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
          <span>排序指标:</span>
          <select
            :value="store.sort"
            class="h-8.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 focus:border-blue-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            @change="store.setSort(($event.target as HTMLSelectElement).value as DimensionSort, tr.range)"
          >
            <option v-for="opt in SORT_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
          </select>
        </div>
      </div>
    </div>

    <!-- ═════════════════════════════════════════════════════════════════ -->
    <!-- 第 2 层：当前维度的 4 个汇总微 KPI 指标                          -->
    <!-- ═════════════════════════════════════════════════════════════════ -->
    <div class="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
      <div class="rounded-xl border border-slate-200 bg-white p-3 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div class="text-xs text-slate-500 dark:text-slate-400">实体总数 (Unique)</div>
        <div class="mt-1 flex items-baseline gap-1.5">
          <span class="text-xl font-bold tabular-nums text-slate-800 dark:text-slate-100">
            {{ dimensionSummary.count }}
          </span>
          <span class="text-xs text-slate-400">个{{ TYPE_CONFIG[store.type].label.slice(0, 2) }}</span>
        </div>
      </div>

      <div class="rounded-xl border border-slate-200 bg-white p-3 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div class="text-xs text-slate-500 dark:text-slate-400">消耗 Top 1 领头羊</div>
        <div class="mt-1 truncate text-base font-bold text-slate-800 dark:text-slate-100" :title="dimensionSummary.top1Key">
          {{ dimensionSummary.top1Key }}
        </div>
        <div class="text-3xs font-medium text-emerald-600 dark:text-emerald-400">
          {{ fmtCost(dimensionSummary.top1Cost) }}
        </div>
      </div>

      <div class="rounded-xl border border-slate-200 bg-white p-3 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div class="text-xs text-slate-500 dark:text-slate-400">当前页总消耗成本</div>
        <div class="mt-1 text-xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
          {{ fmtCost(dimensionSummary.totalCost) }}
        </div>
      </div>

      <div class="rounded-xl border border-slate-200 bg-white p-3 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div class="text-xs text-slate-500 dark:text-slate-400">当前页请求与故障</div>
        <div class="mt-1 text-base font-bold tabular-nums text-slate-800 dark:text-slate-100">
          {{ fmtNumber(dimensionSummary.totalRequests) }} 次
        </div>
        <div class="text-3xs" :class="dimensionSummary.totalErrors > 0 ? 'text-rose-500 font-medium' : 'text-slate-400'">
          {{ dimensionSummary.totalErrors }} 次故障/异常
        </div>
      </div>
    </div>

    <!-- ═════════════════════════════════════════════════════════════════ -->
    <!-- 第 3 层：动态透视条形图 (60%) + Top 5 成本占比环形图 (40%)        -->
    <!-- ═════════════════════════════════════════════════════════════════ -->
    <div class="grid grid-cols-1 gap-4 lg:grid-cols-5">
      <!-- 动态透视图 -->
      <ChartCard
        class="lg:col-span-3"
        :title="`Top 10 ${TYPE_CONFIG[store.type].label.slice(0, 2)}透视图（${SORT_OPTIONS.find((o) => o.value === store.sort)?.label} · 悬停可看成本/Token/延迟明细）`"
        :loading="store.loading"
      >
        <BaseChart :option="barOption" height="300px" />
      </ChartCard>

      <!-- 成本占比环形图 -->
      <ChartCard
        class="lg:col-span-2"
        :title="`Top 5 ${TYPE_CONFIG[store.type].label.slice(0, 2)}成本占比`"
        :loading="store.loading"
      >
        <BaseChart :option="donutOption" height="300px" />
      </ChartCard>
    </div>

    <!-- ═════════════════════════════════════════════════════════════════ -->
    <!-- 第 4 层：全功能服务端分页明细表格                                 -->
    <!-- ═════════════════════════════════════════════════════════════════ -->
    <div class="rounded-xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
      <div class="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800">
        <div>
          <h2 class="text-sm font-semibold text-slate-800 dark:text-slate-100">
            {{ TYPE_CONFIG[store.type].label }}全量聚合明细
          </h2>
          <p class="mt-0.5 text-xs text-slate-400">{{ TYPE_CONFIG[store.type].desc }}</p>
        </div>
      </div>

      <DataTable :columns="columns" :rows="filteredData" :row-key="(r) => r.key" />

      <Pagination
        :page="store.page"
        :page-size="store.pageSize"
        :total="store.total"
        @update:page="store.setPage($event, tr.range)"
      />
    </div>

    <p v-if="store.error" class="text-sm text-rose-500">{{ store.error }}</p>
  </div>
</template>
