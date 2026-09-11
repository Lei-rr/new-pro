<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  Layers,
  Users,
  Radio,
  Globe2,
  Cpu,
  ArrowUpDown,
  Download,
  Search,
  Filter,
  X,
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

type DimensionType = 'group' | 'user' | 'channel' | 'ip' | 'model'

const route = useRoute()
const router = useRouter()

const dimensions = [
  { key: 'group' as DimensionType, label: '分组维度', icon: Layers, desc: '按用户组(default/VIP等)聚合' },
  { key: 'user' as DimensionType, label: '用户维度', icon: Users, desc: '按调用发起者账号聚合' },
  { key: 'channel' as DimensionType, label: '渠道维度', icon: Radio, desc: '按上游提供商与中转路由聚合' },
  { key: 'ip' as DimensionType, label: 'IP 地址维度', icon: Globe2, desc: '按客户端访问公网IP聚合' },
  { key: 'model' as DimensionType, label: '模型维度', icon: Cpu, desc: '按具体 LLM 模型名称聚合' },
]

const timeRanges = [
  { key: 'today', label: '今天(0点)' },
  { key: '1h', label: '1小时' },
  { key: '6h', label: '6小时' },
  { key: '24h', label: '24小时' },
  { key: '3d', label: '3天内' },
  { key: '7d', label: '7天内' },
  { key: '30d', label: '30天内' },
  { key: 'all', label: '全部' },
]

const currentDim = ref<DimensionType>((route.query.dimension as DimensionType) || 'group')
const currentRange = ref((route.query.range as string) || 'today')
const activeModelFilter = ref((route.query.model as string) || '')
const activeUserFilter = ref((route.query.username as string) || '')
const searchQuery = ref('')
const sortField = ref('totalRequests')
const sortAsc = ref(false)
const loading = ref(true)
const result = ref<any>(null)

async function loadData() {
  loading.value = true
  try {
    let url = `/api/analytics/dimensions?dimension=${currentDim.value}&range=${currentRange.value}&limit=100`
    if (activeModelFilter.value) url += `&model=${encodeURIComponent(activeModelFilter.value)}`
    if (activeUserFilter.value) url += `&username=${encodeURIComponent(activeUserFilter.value)}`

    const res = await http.get(url)
    result.value = res
  } catch (err) {
    toast.error(errorMessage(err))
  } finally {
    loading.value = false
  }
}

function drillDownWithFilter(type: 'model' | 'user', value: string, targetDim: DimensionType) {
  if (type === 'model') activeModelFilter.value = value
  if (type === 'user') activeUserFilter.value = value
  currentDim.value = targetDim
  loadData()
}

function clearFilters() {
  activeModelFilter.value = ''
  activeUserFilter.value = ''
  loadData()
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
    items = items.filter((it: any) =>
      it.name.toLowerCase().includes(q) || it.id.toLowerCase().includes(q)
    )
  }

  items.sort((a: any, b: any) => {
    let vA = a[sortField.value]
    let vB = b[sortField.value]
    if (typeof vA === 'string') {
      return sortAsc.value ? vA.localeCompare(vB) : vB.localeCompare(vA)
    }
    return sortAsc.value ? vA - vB : vB - vA
  })

  return items
})

function exportCsv() {
  if (!filteredAndSortedItems.value.length) return
  const headers = ['名称', '总请求', '成功数', '失败数', '成功率%', '消耗金额($)', '总Token', '平均耗时(ms)', '首次出现', '最近活跃']
  const rows = filteredAndSortedItems.value.map((i: any) => [
    `"${i.name}"`,
    i.totalRequests,
    i.successRequests,
    i.failedRequests,
    i.successRate,
    i.costUsd,
    i.totalTokens,
    i.avgLatencyMs,
    `"${i.firstSeen || ''}"`,
    `"${i.lastSeen || ''}"`,
  ])
  const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `NewAPI-${currentDim.value}-${currentRange.value}.csv`
  a.click()
  URL.revokeObjectURL(url)
  toast.success('已导出分析数据 CSV')
}

let autoRefreshTimer: any = null

async function silentRefresh() {
  try {
    let url = `/api/analytics/dimensions?dimension=${currentDim.value}&range=${currentRange.value}&limit=100`
    if (activeModelFilter.value) url += `&model=${encodeURIComponent(activeModelFilter.value)}`
    if (activeUserFilter.value) url += `&username=${encodeURIComponent(activeUserFilter.value)}`
    const res = await http.get(url)
    result.value = res
  } catch (_) {}
}

onMounted(() => {
  loadData()
  window.addEventListener('new-pro:refresh', loadData)
  // 停留在多维分析页时，每 10 秒静默更新
  autoRefreshTimer = setInterval(silentRefresh, 10000)
})

onUnmounted(() => {
  if (autoRefreshTimer) {
    clearInterval(autoRefreshTimer)
    autoRefreshTimer = null
  }
  window.removeEventListener('new-pro:refresh', loadData)
})
</script>

<template>
  <div class="space-y-6">
    <!-- 页面顶栏 -->
    <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 class="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <span>多维分析详情</span>
          <Badge variant="outline" class="font-normal text-xs text-muted-foreground">
            下钻剖析
          </Badge>
        </h1>
        <p class="text-xs text-muted-foreground mt-1">
          全时间跨度支持，穿透分组、用户、渠道、IP、模型进行调用质量与资费下钻
        </p>
      </div>

      <!-- 时间维度切换按钮组 -->
      <div class="inline-flex max-w-full overflow-x-auto no-scrollbar rounded-lg border border-border/60 bg-muted/30 p-1">
        <Button
          v-for="r in timeRanges"
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

    <!-- 过滤联动标签栏 (当存在穿透过滤时显示) -->
    <div v-if="activeModelFilter || activeUserFilter" class="flex items-center gap-2 bg-primary/5 border border-primary/20 rounded-lg p-2.5 text-xs">
      <Filter class="size-3.5 text-primary shrink-0" />
      <span class="text-muted-foreground">当前穿透联动约束:</span>
      <Badge v-if="activeModelFilter" variant="secondary" class="gap-1 font-mono text-[11px] h-5">
        模型: {{ activeModelFilter }}
        <X class="size-3 cursor-pointer hover:text-destructive" @click="activeModelFilter = ''; loadData()" />
      </Badge>
      <Badge v-if="activeUserFilter" variant="secondary" class="gap-1 font-mono text-[11px] h-5">
        用户: {{ activeUserFilter }}
        <X class="size-3 cursor-pointer hover:text-destructive" @click="activeUserFilter = ''; loadData()" />
      </Badge>
      <Button variant="ghost" size="xs" class="ml-auto h-5 text-[11px] text-muted-foreground hover:text-foreground cursor-pointer" @click="clearFilters">
        清空穿透约束
      </Button>
    </div>

    <!-- 维度切换 Tab 栏（大按钮卡片式导航） -->
    <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      <Card
        v-for="d in dimensions"
        :key="d.key"
        class="cursor-pointer border-border/60 transition-all hover:border-primary/50 shadow-xs"
        :class="currentDim === d.key && 'border-primary ring-2 ring-primary/20 bg-accent/30'"
        @click="selectDimension(d.key)"
      >
        <CardContent class="p-3.5 flex items-center gap-3">
          <div
            class="size-9 rounded-lg flex items-center justify-center shrink-0"
            :class="currentDim === d.key ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'"
          >
            <component :is="d.icon" class="size-4.5" />
          </div>
          <div class="min-w-0">
            <div class="text-xs font-semibold truncate">{{ d.label }}</div>
            <div class="text-[10px] text-muted-foreground truncate mt-0.5">{{ d.desc }}</div>
          </div>
        </CardContent>
      </Card>
    </div>

    <!-- 分析结果卡片表格 -->
    <Card class="border-border/60 shadow-xs">
      <CardHeader class="pb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <CardTitle class="text-base font-semibold flex items-center gap-2">
            <span>{{ dimensions.find(d => d.key === currentDim)?.label }} 汇总</span>
            <Badge variant="secondary" class="font-mono text-xs">
              {{ filteredAndSortedItems.length }} 条记录
            </Badge>
          </CardTitle>
          <CardDescription class="text-xs">
            时间范围: {{ result?.timeRange?.label || currentRange }}
          </CardDescription>
        </div>

        <!-- 筛选过滤与导出操作 -->
        <div class="flex items-center gap-2.5">
          <div class="relative w-48 sm:w-64">
            <Search class="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
            <Input
              v-model="searchQuery"
              placeholder="搜索实体名称 / IP..."
              class="h-8 pl-8 text-xs bg-muted/20"
            />
          </div>
          <Button variant="outline" size="sm" class="h-8 gap-1.5 text-xs cursor-pointer" @click="exportCsv">
            <Download class="size-3.5" />
            <span>导出 CSV</span>
          </Button>
        </div>
      </CardHeader>

      <CardContent class="p-0">
        <Table>
          <TableHeader>
            <TableRow class="hover:bg-transparent text-xs">
              <TableHead class="cursor-pointer select-none" @click="toggleSort('name')">
                <div class="flex items-center gap-1">
                  <span>目标实体</span>
                  <ArrowUpDown class="size-3 text-muted-foreground" />
                </div>
              </TableHead>
              <TableHead class="text-right cursor-pointer select-none" @click="toggleSort('totalRequests')">
                <div class="flex items-center justify-end gap-1">
                  <span>总请求量</span>
                  <ArrowUpDown class="size-3 text-muted-foreground" />
                </div>
              </TableHead>
              <TableHead class="text-right cursor-pointer select-none" @click="toggleSort('successRate')">
                <div class="flex items-center justify-end gap-1">
                  <span>成功率</span>
                  <ArrowUpDown class="size-3 text-muted-foreground" />
                </div>
              </TableHead>
              <TableHead class="text-right cursor-pointer select-none" @click="toggleSort('costUsd')">
                <div class="flex items-center justify-end gap-1">
                  <span>折合费用</span>
                  <ArrowUpDown class="size-3 text-muted-foreground" />
                </div>
              </TableHead>
              <TableHead class="text-right cursor-pointer select-none" @click="toggleSort('totalTokens')">
                <div class="flex items-center justify-end gap-1">
                  <span>Token 消耗</span>
                  <ArrowUpDown class="size-3 text-muted-foreground" />
                </div>
              </TableHead>
              <TableHead class="text-right cursor-pointer select-none" @click="toggleSort('avgLatencyMs')">
                <div class="flex items-center justify-end gap-1">
                  <span>平均延迟</span>
                  <ArrowUpDown class="size-3 text-muted-foreground" />
                </div>
              </TableHead>
              <TableHead class="text-right text-xs">活跃时间</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="item in filteredAndSortedItems" :key="item.id" class="hover:bg-muted/40 group">
              <TableCell class="font-medium text-xs">
                <div class="flex items-center justify-between gap-2 max-w-[240px]">
                  <span class="font-mono text-foreground truncate">{{ item.name }}</span>
                  <!-- 穿透快捷操作小按钮 -->
                  <div class="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity shrink-0">
                    <Button
                      v-if="currentDim === 'model'"
                      variant="outline"
                      size="xs"
                      class="h-5 px-1.5 text-[10px] cursor-pointer"
                      @click.stop="drillDownWithFilter('model', item.name, 'user')"
                      title="查看调用该模型的用户分布"
                    >
                      查用户
                    </Button>
                    <Button
                      v-if="currentDim === 'user'"
                      variant="outline"
                      size="xs"
                      class="h-5 px-1.5 text-[10px] cursor-pointer"
                      @click.stop="drillDownWithFilter('user', item.name, 'model')"
                      title="查看该用户常用的模型"
                    >
                      查模型
                    </Button>
                  </div>
                </div>
              </TableCell>
              <TableCell class="text-right font-mono text-xs">
                <div>{{ formatNumber(item.totalRequests) }}</div>
                <div class="text-[10px] text-muted-foreground">
                  失败 {{ formatNumber(item.failedRequests) }}
                </div>
              </TableCell>
              <TableCell class="text-right font-mono text-xs">
                <Badge
                  :variant="item.successRate >= 95 ? 'secondary' : item.successRate >= 80 ? 'outline' : 'destructive'"
                  class="text-[10px] px-1.5 py-0 h-4"
                >
                  {{ item.successRate }}%
                </Badge>
              </TableCell>
              <TableCell class="text-right font-mono text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                ${{ item.costUsd }}
              </TableCell>
              <TableCell class="text-right font-mono text-xs text-muted-foreground">
                {{ formatTokens(item.totalTokens) }}
              </TableCell>
              <TableCell class="text-right font-mono text-xs">
                <span :class="item.avgLatencyMs > 5000 ? 'text-destructive font-semibold' : item.avgLatencyMs > 2000 ? 'text-amber-500' : 'text-foreground'">
                  {{ item.avgLatencyMs }}ms
                </span>
              </TableCell>
              <TableCell class="text-right font-mono text-[11px] text-muted-foreground">
                <div class="truncate max-w-[120px]">{{ item.lastSeen ? item.lastSeen.slice(5) : '-' }}</div>
              </TableCell>
            </TableRow>
            <TableRow v-if="!filteredAndSortedItems.length">
              <TableCell colspan="7" class="text-center py-8 text-xs text-muted-foreground">
                {{ loading ? '数据加载中...' : '当前筛选条件与时间维度下未检索到数据' }}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  </div>
</template>
