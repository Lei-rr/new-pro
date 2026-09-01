<script setup lang="ts">
import { computed, onMounted, watch } from 'vue';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from '@lucide/vue';
import type { EChartsCoreOption } from 'echarts/core';
import { useDimensionsStore } from '@/stores/dimensions';
import { useAppStore } from '@/stores/app';
import { formatCost, formatNumber } from '@/lib/formatters';
import BaseChart from '@/components/charts/BaseChart.vue';
import type { DimensionSort, DimensionType } from '@/api/types';

const store = useDimensionsStore();
const app = useAppStore();

onMounted(() => store.load());

watch(() => app.rangeDays, () => store.load());

const DIMENSIONS = [
  { value: 'model', label: '模型' },
  { value: 'channel', label: '渠道' },
  { value: 'token', label: '令牌' },
  { value: 'user', label: '用户' },
  { value: 'group', label: '分组' },
] as const;

const SORTS = [
  { value: 'requests', label: '请求数' },
  { value: 'tokens', label: 'Tokens' },
  { value: 'quota', label: 'Quota' },
  { value: 'cost', label: '成本' },
] as const;

/** 当前时间范围标题（自然日） */
const rangeLabel = computed(() => (app.rangeDays === 1 ? '今天' : `近 ${app.rangeDays} 天`));

const totalPages = computed(() => Math.max(1, Math.ceil((store.data?.total ?? 0) / store.limit)));
const currentPage = computed(() => Math.floor(store.offset / store.limit) + 1);

const top10 = computed(() => (store.data?.data ?? []).slice(0, 10));

const barChart = computed<EChartsCoreOption>(() => ({
  tooltip: { trigger: 'axis' },
  xAxis: {
    type: 'value',
    splitLine: { lineStyle: { opacity: 0.15 } },
    axisLabel: { fontSize: 10 },
  },
  yAxis: {
    type: 'category',
    inverse: true,
    data: [...top10.value].reverse().map((d) => d.key.length > 14 ? d.key.slice(0, 14) + '…' : d.key),
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: { fontSize: 10 },
  },
  grid: { left: 8, right: 24, top: 8, bottom: 8, containLabel: true },
  series: [
    {
      type: 'bar',
      data: [...top10.value].reverse().map((d) => d.requests),
      barWidth: 8,
      itemStyle: { borderRadius: [0, 4, 4, 0] },
      label: {
        show: true,
        position: 'right',
        fontSize: 10,
        formatter: (p: { value?: unknown }) =>
          typeof p.value === 'number' ? formatNumber(p.value) : '',
      },
    },
  ],
}));
</script>

<template>
  <div class="flex flex-col gap-4">
    <!-- 维度 Tab -->
    <Tabs :model-value="store.type" @update:model-value="(v: unknown) => store.setType((v as DimensionType) ?? 'model')">
      <TabsList class="w-full justify-start sm:w-auto">
        <TabsTrigger v-for="d in DIMENSIONS" :key="d.value" :value="d.value" class="text-xs">
          {{ d.label }}
        </TabsTrigger>
      </TabsList>
    </Tabs>

    <!-- Top 10 分布（上） -->
    <Card class="gap-4 p-4">
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-sm font-semibold">Top 10 分布</h2>
          <p class="text-[11px] text-muted-foreground">
            {{ rangeLabel }} · 按 {{ SORTS.find((s) => s.value === store.sort)?.label ?? '请求数' }} 排序
          </p>
        </div>
        <Select :model-value="store.sort" @update:model-value="(v: unknown) => store.setSort((v as DimensionSort) ?? 'requests')">
          <SelectTrigger class="h-8 w-28 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="s in SORTS" :key="s.value" :value="s.value">{{ s.label }}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <BaseChart :option="barChart" height="340px" />
    </Card>

    <!-- 明细表（下） -->
    <Card class="p-0">
      <div class="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow class="hover:bg-transparent">
              <TableHead class="text-xs">名称</TableHead>
              <TableHead class="text-right text-xs">请求</TableHead>
              <TableHead class="text-right text-xs">Tokens</TableHead>
              <TableHead class="text-right text-xs">成本</TableHead>
              <TableHead class="text-right text-xs">平均耗时</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="d in store.data?.data ?? []" :key="d.key">
                <TableCell class="max-w-48 truncate text-xs font-medium">
                  {{ d.key }}
                </TableCell>
              <TableCell class="text-right text-xs tabular-nums">{{ formatNumber(d.requests) }}</TableCell>
              <TableCell class="text-right text-xs tabular-nums">{{ formatNumber(d.totalTokens) }}</TableCell>
              <TableCell class="text-right text-xs tabular-nums">{{ formatCost(d.cost) }}</TableCell>
              <TableCell class="text-right text-xs tabular-nums">{{ d.avgUseTime ? `${d.avgUseTime.toFixed(1)}s` : '—' }}</TableCell>
            </TableRow>
            <TableRow v-if="!store.loading && !(store.data?.data ?? []).length">
              <TableCell colspan="5" class="py-10 text-center text-xs text-muted-foreground">暂无数据</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      <div class="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3">
        <div class="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span>每页</span>
          <Select
            :model-value="String(store.limit)"
            @update:model-value="(v: unknown) => store.setPageSize(Number(v))"
          >
            <SelectTrigger class="h-7 w-16 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="n in [20, 50, 100, 200]" :key="n" :value="String(n)">{{ n }}</SelectItem>
            </SelectContent>
          </Select>
          <span class="tabular-nums">共 {{ formatNumber(store.data?.total) }} 项 · {{ totalPages }} 页</span>
        </div>

        <div class="flex items-center gap-1.5">
          <Button variant="outline" size="icon-xs" :disabled="currentPage <= 1" @click="store.goTo(1)">
            <ChevronsLeft class="size-3.5" />
          </Button>
          <Button variant="outline" size="icon-xs" :disabled="currentPage <= 1" @click="store.goTo(currentPage - 1)">
            <ChevronLeft class="size-3.5" />
          </Button>
          <span class="flex items-center gap-1 px-1 text-[11px] tabular-nums">
            <Input
              :model-value="String(currentPage)"
              type="number"
              min="1"
              :max="totalPages"
              class="h-7 w-14 text-center text-xs"
              @update:model-value="(v: unknown) => { const p = Math.min(Math.max(1, Number(v) || 1), totalPages); if (p !== currentPage) store.goTo(p); }"
            />
            / {{ totalPages }}
          </span>
          <Button variant="outline" size="icon-xs" :disabled="currentPage >= totalPages" @click="store.goTo(currentPage + 1)">
            <ChevronRight class="size-3.5" />
          </Button>
          <Button variant="outline" size="icon-xs" :disabled="currentPage >= totalPages" @click="store.goTo(totalPages)">
            <ChevronsRight class="size-3.5" />
          </Button>
        </div>
      </div>
    </Card>
  </div>
</template>
