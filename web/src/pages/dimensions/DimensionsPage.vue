<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ArrowUpDown, Cpu, Download, Globe2, Layers, MapPin, Radio, Search, Users } from '@lucide/vue'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card'
import { Button } from '@/shared/ui/button'
import { Badge } from '@/shared/ui/badge'
import { Input } from '@/shared/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table'
import { analyticsApi } from '@/shared/api/endpoints'
import { toast } from '@/shared/lib/toast'
import { errorMessage } from '@/shared/lib/errors'
import { formatNumber, formatTokens } from '@/shared/lib/utils'
import { TIME_RANGES } from '@/shared/constants/time-ranges'
import { useAutoRefresh } from '@/shared/composables/useAutoRefresh'
import { exportToCsv } from '@/shared/composables/useCsvExport'
import type { DimensionAnalysisResult, DimensionItem, DimensionType, TimeRangeKey } from '@/shared/api/types'

type SortKey = 'name' | 'totalRequests' | 'successRequests' | 'failedRequests' | 'successRate' | 'costUsd' | 'totalTokens' | 'avgLatencyMs'

const DIMENSIONS: Array<{ key: DimensionType; label: string; icon: typeof Layers; desc: string }> = [
  { key: 'group', label: '分组维度', icon: Layers, desc: '按用户组(default/VIP等)聚合' },
  { key: 'user', label: '用户维度', icon: Users, desc: '按调用发起者账号聚合' },
  { key: 'channel', label: '渠道维度', icon: Radio, desc: '按上游提供商与中转路由聚合' },
  { key: 'ip', label: 'IP 地址维度', icon: Globe2, desc: '按客户端访问公网IP聚合' },
  { key: 'model', label: '模型维度', icon: Cpu, desc: '按具体 LLM 模型名称聚合' },
]

const SORTABLE_COLUMNS: Array<{ key: SortKey; label: string }> = [
  { key: 'totalRequests', label: '总调用量' },
  { key: 'successRequests', label: '成功' },
  { key: 'failedRequests', label: '失败' },
  { key: 'successRate', label: '成功率' },
  { key: 'costUsd', label: '消耗金额' },
  { key: 'totalTokens', label: '总 Token' },
  { key: 'avgLatencyMs', label: '均耗时' },
]

const route = useRoute()
const isDimension = (value: unknown): value is DimensionType =>
  DIMENSIONS.some((item) => item.key === value)
const isRange = (value: unknown): value is TimeRangeKey =>
  TIME_RANGES.some((item) => item.key === value)

const currentDim = ref<DimensionType>(isDimension(route.query.dimension) ? route.query.dimension : 'group')
const currentRange = ref<TimeRangeKey>(isRange(route.query.range) ? route.query.range : 'today')
const searchQuery = ref('')
const sortKey = ref<SortKey>('totalRequests')
const sortAsc = ref(false)
const loading = ref(true)
const result = ref<DimensionAnalysisResult | null>(null)

async function loadData(silent = false): Promise<void> {
  if (!silent) loading.value = true
  try {
    result.value = await analyticsApi.dimensions(currentDim.value, currentRange.value, 100)
  } catch (err) {
    if (!silent) toast.error(errorMessage(err))
  } finally {
    if (!silent) loading.value = false
  }
}

function selectDimension(dimension: DimensionType): void {
  if (dimension === currentDim.value) return
  currentDim.value = dimension
  void loadData()
}

function selectRange(range: TimeRangeKey): void {
  if (range === currentRange.value) return
  currentRange.value = range
  void loadData()
}

function toggleSort(key: SortKey): void {
  if (sortKey.value === key) sortAsc.value = !sortAsc.value
  else {
    sortKey.value = key
    sortAsc.value = false
  }
}

const visibleItems = computed<DimensionItem[]>(() => {
  const items = result.value?.items ?? []
  const keyword = searchQuery.value.trim().toLowerCase()

  const filtered = keyword
    ? items.filter(
        (item) =>
          item.name.toLowerCase().includes(keyword) ||
          item.id.toLowerCase().includes(keyword) ||
          (item.location?.toLowerCase().includes(keyword) ?? false)
      )
    : [...items]

  const field = sortKey.value
  filtered.sort((a, b) => {
    const left = a[field]
    const right = b[field]
    if (typeof left === 'string' && typeof right === 'string') {
      return sortAsc.value ? left.localeCompare(right) : right.localeCompare(left)
    }
    const diff = Number(left) - Number(right)
    return sortAsc.value ? diff : -diff
  })
  return filtered
})

const currentDimensionLabel = computed(
  () => DIMENSIONS.find((item) => item.key === currentDim.value)?.label ?? ''
)
const isIpDimension = computed(() => currentDim.value === 'ip')

function handleExport(): void {
  const items = visibleItems.value
  if (!items.length) return

  const headers = [
    ...(isIpDimension.value ? ['IP地址', '归属地'] : ['名称']),
    '总请求',
    '成功数',
    '失败数',
    '成功率%',
    '消耗金额($)',
    '总Token',
    '输入Token',
    '输出Token',
    '平均耗时(ms)',
    '首次出现',
    '最近活跃',
  ]

  const rows = items.map((item) => [
    item.name,
    ...(isIpDimension.value ? [item.location || '-'] : []),
    item.totalRequests,
    item.successRequests,
    item.failedRequests,
    item.successRate,
    item.costUsd,
    item.totalTokens,
    item.promptTokens,
    item.completionTokens,
    item.avgLatencyMs,
    item.firstSeen,
    item.lastSeen,
  ])

  exportToCsv(`NewAPI-${currentDim.value}-${currentRange.value}`, headers, rows)
}

useAutoRefresh(() => loadData(true), {
  intervalMs: 10000,
  onManualRefresh: () => loadData(false),
})

void loadData()
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 class="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <span>多维统计分析</span>
          <Badge variant="outline" class="font-normal text-xs text-muted-foreground">深度钻取</Badge>
        </h1>
        <p class="text-xs text-muted-foreground mt-1">
          按组织分组、终端用户、上游渠道、客户端 IP 与大模型名称进行全量交叉下钻分析
        </p>
      </div>

      <div class="inline-flex max-w-full overflow-x-auto no-scrollbar rounded-lg border border-border/60 bg-muted/30 p-1">
        <Button
          v-for="item in TIME_RANGES"
          :key="item.key"
          size="xs"
          variant="ghost"
          class="h-7 text-xs px-2.5 rounded-md cursor-pointer transition-all shrink-0 whitespace-nowrap"
          :class="
            currentRange === item.key
              ? 'bg-card text-foreground shadow-xs font-semibold'
              : 'text-muted-foreground hover:text-foreground'
          "
          @click="selectRange(item.key)"
        >
          {{ item.label }}
        </Button>
      </div>
    </div>

    <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
      <Card
        v-for="dim in DIMENSIONS"
        :key="dim.key"
        class="border transition-all cursor-pointer select-none"
        :class="
          currentDim === dim.key
            ? 'border-primary bg-primary/5 shadow-xs'
            : 'border-border/60 bg-card/60 hover:bg-muted/40 hover:border-border'
        "
        @click="selectDimension(dim.key)"
      >
        <CardContent class="p-3 sm:p-4 flex items-center gap-3">
          <div
            class="size-8 rounded-lg flex items-center justify-center shrink-0 transition-colors"
            :class="currentDim === dim.key ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground/70'"
          >
            <component :is="dim.icon" class="size-4" />
          </div>
          <div class="min-w-0 flex-1">
            <div class="text-xs font-semibold truncate" :class="currentDim === dim.key ? 'text-primary' : 'text-foreground'">
              {{ dim.label }}
            </div>
            <div class="text-[10px] text-muted-foreground truncate mt-0.5">{{ dim.desc }}</div>
          </div>
        </CardContent>
      </Card>
    </div>

    <Card class="border-border/60 shadow-xs">
      <CardHeader class="pb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <CardTitle class="text-base font-semibold flex items-center gap-2">
            <span>{{ currentDimensionLabel }}明细</span>
            <Badge variant="secondary" class="text-xs font-mono">共 {{ visibleItems.length }} 项</Badge>
          </CardTitle>
          <CardDescription class="text-xs">支持任意字段升降序排序、归属地模糊查找与一键导出分析报表</CardDescription>
        </div>

        <div class="flex items-center gap-2.5 w-full sm:w-auto">
          <div class="relative flex-1 sm:w-60">
            <Search class="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              v-model="searchQuery"
              :placeholder="isIpDimension ? '搜 IP 或归属地...' : '搜索名称/标识...'"
              class="h-8 pl-8 text-xs placeholder:text-muted-foreground/70"
            />
          </div>
          <Button variant="outline" size="sm" class="h-8 text-xs gap-1.5 cursor-pointer shrink-0" @click="handleExport">
            <Download class="size-3.5" />
            <span>导出 CSV</span>
          </Button>
        </div>
      </CardHeader>
      <CardContent class="p-0">
        <Table>
          <TableHeader>
            <TableRow class="hover:bg-transparent">
              <TableHead class="text-xs font-semibold cursor-pointer select-none" @click="toggleSort('name')">
                <div class="flex items-center gap-1">
                  <span>{{ isIpDimension ? 'IP 地址 / 地理位置' : '标识 / 名称' }}</span>
                  <ArrowUpDown class="size-3 opacity-60" />
                </div>
              </TableHead>
              <TableHead
                v-for="column in SORTABLE_COLUMNS"
                :key="column.key"
                class="text-right text-xs font-semibold cursor-pointer select-none"
                :class="column.key === 'avgLatencyMs' && 'pr-4'"
                @click="toggleSort(column.key)"
              >
                <div class="flex items-center justify-end gap-1">
                  <span>{{ column.label }}</span>
                  <ArrowUpDown class="size-3 opacity-60" />
                </div>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="item in visibleItems" :key="item.id" class="hover:bg-muted/40">
              <TableCell class="font-medium text-xs">
                <div class="flex flex-col gap-0.5">
                  <span class="font-mono text-foreground">{{ item.name }}</span>
                  <div v-if="isIpDimension" class="flex items-center gap-1 text-[11px] text-muted-foreground mt-0.5">
                    <MapPin class="size-3 text-sky-500 shrink-0" />
                    <span class="truncate max-w-[200px]" :title="item.location || '未知位置'">
                      {{ item.location || '未知位置' }}
                    </span>
                  </div>
                </div>
              </TableCell>
              <TableCell class="text-right font-mono text-xs font-semibold">{{ formatNumber(item.totalRequests) }}</TableCell>
              <TableCell class="text-right font-mono text-xs text-emerald-600 dark:text-emerald-400">
                {{ formatNumber(item.successRequests) }}
              </TableCell>
              <TableCell class="text-right font-mono text-xs text-rose-500">{{ formatNumber(item.failedRequests) }}</TableCell>
              <TableCell class="text-right font-mono text-xs">
                <Badge
                  :variant="item.successRate >= 98 ? 'default' : item.successRate >= 85 ? 'secondary' : 'destructive'"
                  class="text-[10px] px-1.5 py-0 h-4 font-mono"
                  :class="item.successRate >= 98 && 'bg-emerald-500 hover:bg-emerald-600 text-white border-transparent'"
                >
                  {{ item.successRate }}%
                </Badge>
              </TableCell>
              <TableCell class="text-right font-mono text-xs text-emerald-600 dark:text-emerald-400 font-semibold">
                ${{ item.costUsd.toFixed(4) }}
              </TableCell>
              <!-- Tokens：第一行总量，第二行输入/输出拆分，与实时流水保持一致 -->
              <TableCell class="text-right font-mono text-xs">
                <div>{{ formatTokens(item.totalTokens) }}</div>
                <div class="text-[10px] text-muted-foreground">
                  {{ formatTokens(item.promptTokens) }} / {{ formatTokens(item.completionTokens) }}
                </div>
              </TableCell>
              <TableCell class="text-right font-mono text-xs pr-4">{{ item.avgLatencyMs }}ms</TableCell>
            </TableRow>
            <TableRow v-if="!visibleItems.length">
              <TableCell colspan="8" class="text-center py-10 text-xs text-muted-foreground">
                {{ loading ? '正在加载聚合数据...' : '所选筛选条件下暂无聚合数据' }}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  </div>
</template>
