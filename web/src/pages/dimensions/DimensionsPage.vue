<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRoute } from 'vue-router'
import {
  Layers,
  Users,
  Radio,
  Globe2,
  Cpu,
  ArrowUpDown,
  Download,
  Search,
  MapPin,
} from '@lucide/vue'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card'
import { Button } from '@/shared/ui/button'
import { Badge } from '@/shared/ui/badge'
import { Input } from '@/shared/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table'
import { http } from '@/shared/api/http'
import { toast } from '@/shared/lib/toast'
import { errorMessage } from '@/shared/lib/errors'
import { formatNumber, formatTokens } from '@/shared/lib/utils'
import { TIME_RANGES } from '@/shared/constants/time-ranges'
import { useAutoRefresh } from '@/shared/composables/useAutoRefresh'
import { exportToCsv } from '@/shared/composables/useCsvExport'

type DimensionType = 'group' | 'user' | 'channel' | 'ip' | 'model'

const route = useRoute()

const dimensions = [
  { key: 'group' as DimensionType, label: '分组维度', icon: Layers, desc: '按用户组(default/VIP等)聚合' },
  { key: 'user' as DimensionType, label: '用户维度', icon: Users, desc: '按调用发起者账号聚合' },
  { key: 'channel' as DimensionType, label: '渠道维度', icon: Radio, desc: '按上游提供商与中转路由聚合' },
  { key: 'ip' as DimensionType, label: 'IP 地址维度', icon: Globe2, desc: '按客户端访问公网IP聚合' },
  { key: 'model' as DimensionType, label: '模型维度', icon: Cpu, desc: '按具体 LLM 模型名称聚合' },
]

const currentDim = ref<DimensionType>((route.query.dimension as DimensionType) || 'group')
const currentRange = ref((route.query.range as string) || 'today')
const searchQuery = ref('')
const sortField = ref('totalRequests')
const sortAsc = ref(false)
const loading = ref(true)
const result = ref<any>(null)

async function loadData(silent = false) {
  if (!silent) loading.value = true
  try {
    const url = `/api/analytics/dimensions?dimension=${currentDim.value}&range=${currentRange.value}&limit=100`
    const res = await http.get(url)
    result.value = res
  } catch (err) {
    if (!silent) toast.error(errorMessage(err))
  } finally {
    if (!silent) loading.value = false
  }
}

function selectDimension(dim: DimensionType) {
  currentDim.value = dim
  loadData()
}

function selectRange(range: string) {
  currentRange.value = range
  loadData()
}

function toggleSort(field: string) {
  if (sortField.value === field) {
    sortAsc.value = !sortAsc.value
  } else {
    sortField.value = field
    sortAsc.value = false
  }
}

const filteredAndSortedItems = computed(() => {
  if (!result.value?.items) return []
  let items = [...result.value.items]

  if (searchQuery.value.trim()) {
    const q = searchQuery.value.trim().toLowerCase()
    items = items.filter(
      (it: any) =>
        it.name.toLowerCase().includes(q) ||
        it.id.toLowerCase().includes(q) ||
        (it.location && it.location.toLowerCase().includes(q))
    )
  }

  items.sort((a: any, b: any) => {
    const vA = a[sortField.value]
    const vB = b[sortField.value]
    if (typeof vA === 'string') {
      return sortAsc.value ? vA.localeCompare(vB) : vB.localeCompare(vA)
    }
    return sortAsc.value ? vA - vB : vB - vA
  })

  return items
})

function handleExportCsv() {
  if (!filteredAndSortedItems.value.length) return
  const isIp = currentDim.value === 'ip'
  const headers = isIp
    ? ['IP地址', '归属地', '总请求', '成功数', '失败数', '成功率%', '消耗金额($)', '总Token', '平均耗时(ms)', '首次出现', '最近活跃']
    : ['名称', '总请求', '成功数', '失败数', '成功率%', '消耗金额($)', '总Token', '平均耗时(ms)', '首次出现', '最近活跃']

  const rows = filteredAndSortedItems.value.map((i: any) => {
    if (isIp) {
      return [
        i.name,
        i.location || '-',
        i.totalRequests,
        i.successRequests,
        i.failedRequests,
        i.successRate,
        i.costUsd,
        i.totalTokens,
        i.avgLatencyMs,
        i.firstSeen || '',
        i.lastSeen || '',
      ]
    }
    return [
      i.name,
      i.totalRequests,
      i.successRequests,
      i.failedRequests,
      i.successRate,
      i.costUsd,
      i.totalTokens,
      i.avgLatencyMs,
      i.firstSeen || '',
      i.lastSeen || '',
    ]
  })

  exportToCsv(`NewAPI-${currentDim.value}-${currentRange.value}`, headers, rows)
}

// 静默自动刷新 (10 秒)
useAutoRefresh(() => loadData(true), {
  intervalMs: 10000,
  onRefreshEvent: () => loadData(false),
})

loadData()
</script>

<template>
  <div class="space-y-6">
    <!-- 顶部标题与维度切换控制 -->
    <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 class="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <span>多维统计分析</span>
          <Badge variant="outline" class="font-normal text-xs text-muted-foreground">
            深度钻取
          </Badge>
        </h1>
        <p class="text-xs text-muted-foreground mt-1">
          按组织分组、终端用户、上游渠道、客户端 IP 与大模型名称进行全量交叉下钻分析
        </p>
      </div>

      <!-- 时间区间切换 -->
      <div class="inline-flex max-w-full overflow-x-auto no-scrollbar rounded-lg border border-border/60 bg-muted/30 p-1">
        <Button
          v-for="r in TIME_RANGES"
          :key="r.key"
          size="xs"
          variant="ghost"
          class="h-7 text-xs px-2.5 rounded-md cursor-pointer transition-all shrink-0 whitespace-nowrap"
          :class="currentRange === r.key ? 'bg-card text-foreground shadow-xs font-semibold' : 'text-muted-foreground hover:text-foreground'"
          @click="selectRange(r.key)"
        >
          {{ r.label }}
        </Button>
      </div>
    </div>

    <!-- 维度标签选择卡片 (5 大核心维度) -->
    <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
      <Card
        v-for="dim in dimensions"
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
            <div class="text-[10px] text-muted-foreground truncate mt-0.5">
              {{ dim.desc }}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>

    <!-- 多维分析表格容器 -->
    <Card class="border-border/60 shadow-xs">
      <CardHeader class="pb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <CardTitle class="text-base font-semibold flex items-center gap-2">
            <span>{{ dimensions.find(d => d.key === currentDim)?.label }}明细</span>
            <Badge variant="secondary" class="text-xs font-mono">
              共 {{ filteredAndSortedItems.length }} 项
            </Badge>
          </CardTitle>
          <CardDescription class="text-xs">支持任意字段升降序排序、归属地模糊查找与一键导出分析报表</CardDescription>
        </div>

        <div class="flex items-center gap-2.5 w-full sm:w-auto">
          <div class="relative flex-1 sm:w-60">
            <Search class="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              v-model="searchQuery"
              :placeholder="currentDim === 'ip' ? '搜 IP 或归属地...' : '搜索名称/标识...'"
              class="h-8 pl-8 text-xs placeholder:text-muted-foreground/70"
            />
          </div>
          <Button variant="outline" size="sm" class="h-8 text-xs gap-1.5 cursor-pointer shrink-0" @click="handleExportCsv">
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
                  <span>{{ currentDim === 'ip' ? 'IP 地址 / 地理位置' : '标识 / 名称' }}</span>
                  <ArrowUpDown class="size-3 opacity-60" />
                </div>
              </TableHead>
              <TableHead class="text-right text-xs font-semibold cursor-pointer select-none" @click="toggleSort('totalRequests')">
                <div class="flex items-center justify-end gap-1">
                  <span>总调用量</span>
                  <ArrowUpDown class="size-3 opacity-60" />
                </div>
              </TableHead>
              <TableHead class="text-right text-xs font-semibold cursor-pointer select-none" @click="toggleSort('successRequests')">
                <div class="flex items-center justify-end gap-1">
                  <span>成功</span>
                  <ArrowUpDown class="size-3 opacity-60" />
                </div>
              </TableHead>
              <TableHead class="text-right text-xs font-semibold cursor-pointer select-none" @click="toggleSort('failedRequests')">
                <div class="flex items-center justify-end gap-1">
                  <span>失败</span>
                  <ArrowUpDown class="size-3 opacity-60" />
                </div>
              </TableHead>
              <TableHead class="text-right text-xs font-semibold cursor-pointer select-none" @click="toggleSort('successRate')">
                <div class="flex items-center justify-end gap-1">
                  <span>成功率</span>
                  <ArrowUpDown class="size-3 opacity-60" />
                </div>
              </TableHead>
              <TableHead class="text-right text-xs font-semibold cursor-pointer select-none" @click="toggleSort('costUsd')">
                <div class="flex items-center justify-end gap-1">
                  <span>消耗金额</span>
                  <ArrowUpDown class="size-3 opacity-60" />
                </div>
              </TableHead>
              <TableHead class="text-right text-xs font-semibold cursor-pointer select-none" @click="toggleSort('totalTokens')">
                <div class="flex items-center justify-end gap-1">
                  <span>总 Token</span>
                  <ArrowUpDown class="size-3 opacity-60" />
                </div>
              </TableHead>
              <TableHead class="text-right text-xs font-semibold cursor-pointer select-none pr-4" @click="toggleSort('avgLatencyMs')">
                <div class="flex items-center justify-end gap-1">
                  <span>均耗时</span>
                  <ArrowUpDown class="size-3 opacity-60" />
                </div>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="item in filteredAndSortedItems" :key="item.id" class="hover:bg-muted/40">
              <TableCell class="font-medium text-xs">
                <div class="flex flex-col gap-0.5">
                  <span class="font-mono text-foreground">{{ item.name }}</span>
                  <div v-if="currentDim === 'ip'" class="flex items-center gap-1 text-[11px] text-muted-foreground mt-0.5">
                    <MapPin class="size-3 text-sky-500 shrink-0" />
                    <span class="truncate max-w-[200px]" :title="item.location || '未知位置'">
                      {{ item.location || '未知位置' }}
                    </span>
                  </div>
                </div>
              </TableCell>
              <TableCell class="text-right font-mono text-xs font-semibold">
                {{ formatNumber(item.totalRequests) }}
              </TableCell>
              <TableCell class="text-right font-mono text-xs text-emerald-600 dark:text-emerald-400">
                {{ formatNumber(item.successRequests) }}
              </TableCell>
              <TableCell class="text-right font-mono text-xs text-rose-500">
                {{ formatNumber(item.failedRequests) }}
              </TableCell>
              <TableCell class="text-right font-mono text-xs">
                <Badge
                  :variant="item.successRate >= 98 ? 'default' : (item.successRate >= 85 ? 'secondary' : 'destructive')"
                  class="text-[10px] px-1.5 py-0 h-4 font-mono"
                  :class="item.successRate >= 98 && 'bg-emerald-500 hover:bg-emerald-600 text-white border-transparent'"
                >
                  {{ item.successRate }}%
                </Badge>
              </TableCell>
              <TableCell class="text-right font-mono text-xs text-emerald-600 dark:text-emerald-400 font-semibold">
                ${{ item.costUsd.toFixed(4) }}
              </TableCell>
              <TableCell class="text-right font-mono text-xs">
                {{ formatTokens(item.totalTokens) }}
              </TableCell>
              <TableCell class="text-right font-mono text-xs pr-4">
                {{ item.avgLatencyMs }}ms
              </TableCell>
            </TableRow>
            <TableRow v-if="!filteredAndSortedItems.length">
              <TableCell colspan="8" class="text-center py-10 text-xs text-muted-foreground">
                所选筛选条件下暂无聚合数据
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  </div>
</template>
