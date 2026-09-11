<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, shallowRef, watch } from 'vue'
import VChart from 'vue-echarts'
import '@/shared/lib/echarts'
import {
  Activity,
  ArrowUpRight,
  CheckCircle2,
  XCircle,
  Coins,
  Gauge,
  Layers,
  Clock,
  Radio,
  Server,
  Zap,
  Pause,
  Play,
  Copy,
  BarChart3,
  AreaChart,
} from '@lucide/vue'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card'
import { Button } from '@/shared/ui/button'
import { Badge } from '@/shared/ui/badge'
import { Progress } from '@/shared/ui/progress'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table'
import { http } from '@/shared/api/http'
import { useRealtimePulse } from '@/shared/api/websocket'
import { toast } from '@/shared/lib/toast'
import { errorMessage } from '@/shared/lib/errors'
import { formatNumber, formatTokens, copyToClipboard } from '@/shared/lib/utils'
import NumberRolling from '@/shared/ui/NumberRolling.vue'
import ChannelUptimePanel from './components/ChannelUptimePanel.vue'
import ConsumptionDistributionChart from './components/ConsumptionDistributionChart.vue'
import PerformanceHealthPanel from './components/PerformanceHealthPanel.vue'
import StreamAndLatencyPanel from './components/StreamAndLatencyPanel.vue'

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

const currentRange = ref('today')
const loading = ref(true)
const overview = ref<any>(null)

// 趋势图模式切换：bar (柱状堆叠) vs area (平滑面积流)
const trendChartType = ref<'bar' | 'area'>('area')

// 接入统一的 WebSocket 实时数据流
const { pulse, isConnected: wsConnected } = useRealtimePulse()

// 跟踪已累加的实时流水 ID 集合与已知 IP/用户集合
const processedLogIds = new Set<number>()
const knownIps = new Set<string>()
const knownUsers = new Set<string>()
let autoRefreshTimer: NodeJS.Timeout | null = null

// 记录基准最大日志 ID，仅累加新到达的日志
let lastBaseLogId = 0

// 监听 WebSocket 推送的实时流水，当为今天/全天跨度时，纯前端实时平滑累加宏观卡片指标（0 DB 开销）
watch(
  () => pulse.value?.recentLogs,
  (logs) => {
    if (!logs || !logs.length || !overview.value?.summary) return
    // 仅在统计范围包含当前实时时间（如今天、24h、全部）时进行前端自增累加
    if (!['today', '1h', '6h', '24h', '3d', '7d', '30d', 'all'].includes(currentRange.value)) return

    const summary = overview.value.summary
    let addedReq = 0
    let addedSuccess = 0
    let addedFailed = 0
    let addedQuota = 0
    let addedPromptTokens = 0
    let addedCompletionTokens = 0
    let addedIps = 0
    let addedUsers = 0

    for (const log of logs) {
      if (!log.id || log.id <= lastBaseLogId || processedLogIds.has(log.id)) continue
      processedLogIds.add(log.id)

      addedReq += 1
      if (log.status === 'success') {
        addedSuccess += 1
        addedQuota += log.quota || 0
        addedPromptTokens += log.promptTokens || 0
        addedCompletionTokens += log.completionTokens || 0
      } else if (log.status === 'failed') {
        addedFailed += 1
      }

      // 实时动态捕获新活跃 IP
      if (log.ip && log.ip !== '-' && !knownIps.has(log.ip)) {
        knownIps.add(log.ip)
        addedIps += 1
      }

      // 实时动态捕获新活跃用户
      if (log.username && log.username !== '系统' && !knownUsers.has(log.username)) {
        knownUsers.add(log.username)
        addedUsers += 1
      }
    }

    // 防止 Set 无限膨胀，保持在最近 1000 条以内
    if (processedLogIds.size > 2000) {
      const arr = Array.from(processedLogIds)
      processedLogIds.clear()
      arr.slice(-1000).forEach(id => processedLogIds.add(id))
    }

    if (addedReq > 0) {
      summary.totalRequests = (summary.totalRequests || 0) + addedReq
      summary.successRequests = (summary.successRequests || 0) + addedSuccess
      summary.failedRequests = (summary.failedRequests || 0) + addedFailed
      summary.totalQuota = (summary.totalQuota || 0) + addedQuota
      summary.totalCostUsd = Number((summary.totalQuota / 500000).toFixed(4))
      summary.promptTokens = (summary.promptTokens || 0) + addedPromptTokens
      summary.completionTokens = (summary.completionTokens || 0) + addedCompletionTokens
      summary.totalTokens = (summary.totalTokens || 0) + addedPromptTokens + addedCompletionTokens
      if (addedIps > 0) {
        summary.activeIps = (summary.activeIps || 0) + addedIps
      }
      // 实时联动计算 IP 均调用量与 IP 均消耗额
      if (summary.activeIps > 0) {
        summary.avgReqPerIp = Math.round(summary.totalRequests / summary.activeIps)
        summary.avgCostPerIp = Number((summary.totalCostUsd / summary.activeIps).toFixed(2))
      }
      if (addedUsers > 0) {
        summary.activeUsers = (summary.activeUsers || 0) + addedUsers
      }
      if (summary.activeUsers > 0) {
        summary.avgCostPerUser = Number((summary.totalCostUsd / summary.activeUsers).toFixed(2))
      }
      if (summary.totalRequests > 0) {
        summary.successRate = Number(((summary.successRequests / summary.totalRequests) * 100).toFixed(2))
      }
    }
  },
  { deep: true }
)

// 流水暂停/冻结查看机制
const isStreamPaused = ref(false)
const frozenLogs = ref<any[]>([])

// 动态展示的日志列表
const displayLogs = computed(() => {
  if (isStreamPaused.value) {
    return frozenLogs.value
  }
  return pulse.value?.recentLogs ?? []
})

function toggleStreamPause() {
  if (!isStreamPaused.value) {
    // 暂停并锁定当前快照
    frozenLogs.value = [...(pulse.value?.recentLogs ?? [])]
    isStreamPaused.value = true
    toast.info('实时流水已暂停，便于排查')
  } else {
    // 恢复实时跟随
    isStreamPaused.value = false
    toast.success('已恢复实时流水跟随')
  }
}

async function copyLogDetail(log: any) {
  const text = `[NewAPI 日志] 时间: ${log.createdAt} | 模型: ${log.model} | 渠道: ${log.channelName} | 用户: ${log.username} | IP: ${log.ip} | Token: ${log.totalTokens} | 耗时: ${log.useTime}ms | 状态: ${log.status}`
  const ok = await copyToClipboard(text)
  if (ok) {
    toast.success('日志详情已复制')
  }
}

async function loadData(silent = false) {
  if (!silent) {
    loading.value = true
  }
  try {
    const ovData = await http.get(`/api/analytics/overview?range=${currentRange.value}`)
    if (ovData?.summary?.maxLogId) {
      lastBaseLogId = Math.max(lastBaseLogId, ovData.summary.maxLogId)
    }
    if (silent && overview.value?.summary && ovData?.summary) {
      // 静默校准时：保持单向单调递增，绝不倒退
      ovData.summary.totalRequests = Math.max(ovData.summary.totalRequests || 0, overview.value.summary.totalRequests || 0)
      ovData.summary.successRequests = Math.max(ovData.summary.successRequests || 0, overview.value.summary.successRequests || 0)
      ovData.summary.failedRequests = Math.max(ovData.summary.failedRequests || 0, overview.value.summary.failedRequests || 0)
      ovData.summary.totalQuota = Math.max(ovData.summary.totalQuota || 0, overview.value.summary.totalQuota || 0)
      ovData.summary.totalCostUsd = Number((ovData.summary.totalQuota / 500000).toFixed(4))
      ovData.summary.totalTokens = Math.max(ovData.summary.totalTokens || 0, overview.value.summary.totalTokens || 0)
      ovData.summary.promptTokens = Math.max(ovData.summary.promptTokens || 0, overview.value.summary.promptTokens || 0)
      ovData.summary.completionTokens = Math.max(ovData.summary.completionTokens || 0, overview.value.summary.completionTokens || 0)
      ovData.summary.activeIps = Math.max(ovData.summary.activeIps || 0, overview.value.summary.activeIps || 0)
      ovData.summary.activeUsers = Math.max(ovData.summary.activeUsers || 0, overview.value.summary.activeUsers || 0)
      if (ovData.summary.activeUsers > 0) {
        ovData.summary.avgCostPerUser = Number((ovData.summary.totalCostUsd / ovData.summary.activeUsers).toFixed(2))
      }
    }
    overview.value = ovData
  } catch (err) {
    if (!silent) {
      toast.error(errorMessage(err))
    }
  } finally {
    if (!silent) {
      loading.value = false
    }
  }
}

function selectRange(key: string) {
  currentRange.value = key
  // 切换时间维度时重置
  lastBaseLogId = 0
  processedLogIds.clear()
  knownIps.clear()
  knownUsers.clear()
  loadData()
}

// ECharts 响应式柱状/折线趋势混合图配置
const chartOption = computed(() => {
  const trend = overview.value?.trend || []
  const xData = trend.map((t: any) => t.timePoint.split(' ')[1] || t.timePoint.slice(5))
  const successData = trend.map((t: any) => t.success)
  const failedData = trend.map((t: any) => t.failed)
  const latencyData = trend.map((t: any) => t.avgLatency)

  return {
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'shadow',
      },
      backgroundColor: 'rgba(15, 23, 42, 0.85)',
      borderColor: 'rgba(255, 255, 255, 0.1)',
      textStyle: {
        color: '#f8fafc',
        fontSize: 12,
      },
      formatter: (params: any[]) => {
        if (!params || !params.length) return ''
        const idx = params[0].dataIndex
        const item = trend[idx]
        if (!item) return ''
        return `
          <div class="font-bold mb-1 border-b border-white/20 pb-1">${item.timePoint}</div>
          <div class="flex justify-between gap-4"><span>总请求:</span><span class="font-mono font-semibold">${item.total.toLocaleString()}</span></div>
          <div class="flex justify-between gap-4 text-emerald-400"><span>成功:</span><span class="font-mono font-semibold">${item.success.toLocaleString()}</span></div>
          <div class="flex justify-between gap-4 text-rose-400"><span>失败:</span><span class="font-mono font-semibold">${item.failed.toLocaleString()}</span></div>
          <div class="flex justify-between gap-4 text-sky-400"><span>消耗 Token:</span><span class="font-mono font-semibold">${formatTokens(item.tokens)}</span></div>
          <div class="flex justify-between gap-4 text-amber-300"><span>平均延迟:</span><span class="font-mono font-semibold">${item.avgLatency}ms</span></div>
        `
      },
    },
    legend: {
      data: ['成功', '失败', '延迟(ms)'],
      left: 'center',
      top: '0%',
      textStyle: {
        color: '#888888',
        fontSize: 11,
      },
      itemWidth: 10,
      itemHeight: 10,
    },
    grid: {
      left: '1%',
      right: '1%',
      top: '16%',
      bottom: '5%',
      containLabel: true,
    },
    xAxis: {
      type: 'category',
      data: xData,
      axisLine: { lineStyle: { color: 'rgba(128, 128, 128, 0.25)' } },
      axisLabel: {
        color: '#888888',
        fontSize: 11,
      },
    },
    yAxis: [
      {
        type: 'value',
        name: '请求数',
        nameTextStyle: { color: '#888888', fontSize: 11, padding: [0, 0, 4, 0] },
        splitLine: { lineStyle: { color: 'rgba(128, 128, 128, 0.15)', type: 'dashed' } },
        axisLabel: { color: '#888888', fontSize: 11 },
      },
      {
        type: 'value',
        name: '延迟 (ms)',
        nameTextStyle: { color: '#888888', fontSize: 11, padding: [0, 0, 4, 0] },
        splitLine: { show: false },
        axisLabel: { color: '#888888', fontSize: 11 },
      },
    ],
    series: trendChartType.value === 'area'
      ? [
          {
            name: '成功',
            type: 'line',
            stack: 'total',
            smooth: true,
            showSymbol: false,
            lineStyle: { width: 1.5, color: '#10b981' },
            itemStyle: { color: '#10b981' },
            areaStyle: {
              opacity: 0.35,
              color: '#10b981',
            },
            data: successData,
          },
          {
            name: '失败',
            type: 'line',
            stack: 'total',
            smooth: true,
            showSymbol: false,
            lineStyle: { width: 1.5, color: '#ef4444' },
            itemStyle: { color: '#ef4444' },
            areaStyle: {
              opacity: 0.35,
              color: '#ef4444',
            },
            data: failedData,
          },
          {
            name: '延迟(ms)',
            type: 'line',
            yAxisIndex: 1,
            smooth: true,
            showSymbol: false,
            itemStyle: {
              color: '#0ea5e9',
            },
            lineStyle: {
              width: 2,
              color: '#0ea5e9',
              shadowColor: 'rgba(14, 165, 233, 0.25)',
              shadowBlur: 6,
            },
            data: latencyData,
          },
        ]
      : [
          {
            name: '成功',
            type: 'bar',
            stack: 'total',
            barMaxWidth: 24,
            itemStyle: {
              color: '#10b981',
              borderRadius: [0, 0, 0, 0],
            },
            data: successData,
          },
          {
            name: '失败',
            type: 'bar',
            stack: 'total',
            barMaxWidth: 24,
            itemStyle: {
              color: '#ef4444',
              borderRadius: [3, 3, 0, 0],
            },
            data: failedData,
          },
          {
            name: '延迟(ms)',
            type: 'line',
            yAxisIndex: 1,
            smooth: true,
            showSymbol: false,
            itemStyle: {
              color: '#0ea5e9',
            },
            lineStyle: {
              width: 2,
              color: '#0ea5e9',
              shadowColor: 'rgba(14, 165, 233, 0.25)',
              shadowBlur: 6,
            },
            data: latencyData,
          },
        ],
    dataZoom: [
      {
        type: 'inside',
        start: 0,
        end: 100,
      },
    ],
  }
})



onMounted(() => {
  loadData()
  window.addEventListener('new-pro:refresh', () => loadData(false))
  
  // 按照分级策略：趋势图、模型消耗、SLA与渠道排行等非实时全量指标每 25 秒静默刷新一次
  // （既保证图表能跟随大盘持续动态演进，又避免对数据库造成高频扫描压力）
  autoRefreshTimer = setInterval(() => {
    loadData(true)
  }, 25000)
})

onUnmounted(() => {
  window.removeEventListener('new-pro:refresh', () => loadData(false))
  if (autoRefreshTimer) {
    clearInterval(autoRefreshTimer)
    autoRefreshTimer = null
  }
})
</script>

<template>
  <div class="space-y-6">
    <!-- 顶部控制台标题与时间维度选择器 -->
    <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 class="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <span>控制台大屏</span>
          <Badge variant="outline" class="font-normal text-xs text-muted-foreground border-border/80">
            实时直连分析
          </Badge>
        </h1>
        <p class="text-xs text-muted-foreground mt-1">
          当前监控 NewAPI 核心网关与上游调度状态，秒级刷新吞吐量与时序分布
        </p>
      </div>

      <!-- 时间维度切换按钮组 (移动端横向无缝平滑滑动，避免撑破视口宽屏) -->
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

    <!-- 实时指标横幅 (吞吐与健康) -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
      <!-- QPS / RPM -->
      <Card class="border-border/60 shadow-xs bg-card/60 backdrop-blur-sm">
        <CardContent class="p-4 flex items-center justify-between">
          <div>
            <div class="text-[11px] text-muted-foreground font-medium flex items-center gap-1.5">
              <Radio class="size-3.5 text-emerald-500 animate-pulse" />
              实时吞吐 (RPM)
            </div>
            <div class="text-2xl font-bold mt-1 font-mono">
              <NumberRolling :value="pulse?.rpm ?? 0" suffix="req/min" />
            </div>
            <div class="text-[10px] text-muted-foreground mt-0.5">
              当前 QPS: <span class="font-medium text-foreground"><NumberRolling :value="pulse?.qps ?? 0" :precision="1" /></span>
            </div>
          </div>
          <div class="size-9 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
            <Zap class="size-5" />
          </div>
        </CardContent>
      </Card>

      <!-- TPM Token吞吐 -->
      <Card class="border-border/60 shadow-xs bg-card/60 backdrop-blur-sm">
        <CardContent class="p-4 flex items-center justify-between">
          <div>
            <div class="text-[11px] text-muted-foreground font-medium flex items-center gap-1.5">
              <Activity class="size-3.5 text-blue-500" />
              Token 吞吐 (TPM)
            </div>
            <div class="text-2xl font-bold mt-1 font-mono text-blue-600 dark:text-blue-400">
              <NumberRolling :value="pulse?.tpm ?? 0" :format-fn="formatTokens" suffix="tok/min" />
            </div>
            <div class="text-[10px] text-muted-foreground mt-0.5">
              1分钟活跃IP: <span class="font-medium text-foreground"><NumberRolling :value="pulse?.activeIps1m ?? 0" /></span> 个
            </div>
          </div>
          <div class="size-9 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center">
            <Layers class="size-5" />
          </div>
        </CardContent>
      </Card>

      <!-- 实时平均延迟 -->
      <Card class="border-border/60 shadow-xs bg-card/60 backdrop-blur-sm">
        <CardContent class="p-4 flex items-center justify-between">
          <div>
            <div class="text-[11px] text-muted-foreground font-medium flex items-center gap-1.5">
              <Clock class="size-3.5 text-sky-500" />
              实时上游延迟
            </div>
            <div class="text-2xl font-bold mt-1 font-mono text-sky-600 dark:text-sky-400">
              <NumberRolling :value="pulse?.avgLatency1m ?? 0" suffix="ms" />
            </div>
            <div class="text-[10px] text-muted-foreground mt-0.5">
              周期均延: <span class="font-medium text-foreground">{{ overview?.summary?.avgLatencyMs ?? 0 }}ms</span>
            </div>
          </div>
          <div class="size-9 rounded-lg bg-sky-500/10 text-sky-500 flex items-center justify-center">
            <Gauge class="size-5" />
          </div>
        </CardContent>
      </Card>

      <!-- 实时成功率 -->
      <Card class="border-border/60 shadow-xs bg-card/60 backdrop-blur-sm">
        <CardContent class="p-4 flex items-center justify-between">
          <div>
            <div class="text-[11px] text-muted-foreground font-medium flex items-center gap-1.5">
              <CheckCircle2 class="size-3.5 text-emerald-500" />
              1分钟成功率
            </div>
            <div class="text-2xl font-bold mt-1 font-mono" :class="(pulse?.successRate1m ?? 100) < 90 ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400'">
              <NumberRolling :value="pulse?.successRate1m ?? 100" :precision="2" suffix="%" />
            </div>
            <div class="text-[10px] text-muted-foreground mt-0.5">
              周期总成功率: <span class="font-medium text-foreground">{{ Number(overview?.summary?.successRate ?? 100).toFixed(2) }}%</span>
            </div>
          </div>
          <div class="size-9 rounded-lg bg-primary/5 text-primary flex items-center justify-center">
            <Server class="size-5" />
          </div>
        </CardContent>
      </Card>
    </div>

    <!-- 周期核心宏观指标 4 大卡片 -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <Card class="border-border/60 shadow-xs">
        <CardHeader class="pb-2">
          <CardDescription class="text-xs font-medium">总请求调用量</CardDescription>
          <CardTitle class="text-2xl font-bold font-mono tracking-tight">
            <NumberRolling :value="overview?.summary?.totalRequests ?? 0" only-up />
          </CardTitle>
        </CardHeader>
        <CardContent class="text-xs text-muted-foreground">
          <div class="flex items-center justify-between pt-1">
            <span class="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 class="size-3" />
              成功 <NumberRolling :value="overview?.summary?.successRequests ?? 0" only-up />
            </span>
            <span class="flex items-center gap-1 text-destructive">
              <XCircle class="size-3" />
              失败 <NumberRolling :value="overview?.summary?.failedRequests ?? 0" only-up />
            </span>
          </div>
          <Progress class="h-1.5 mt-2" :model-value="overview?.summary?.successRate ?? 100" />
        </CardContent>
      </Card>

      <Card class="border-border/60 shadow-xs">
        <CardHeader class="pb-2">
          <CardDescription class="text-xs font-medium">消耗总金额 (USD)</CardDescription>
          <CardTitle class="text-2xl font-bold font-mono tracking-tight text-emerald-600 dark:text-emerald-400">
            <NumberRolling :value="overview?.summary?.totalCostUsd ?? 0" prefix="$" :precision="2" only-up />
          </CardTitle>
        </CardHeader>
        <CardContent class="text-xs text-muted-foreground">
          <div class="flex items-center justify-between">
            <span>折合配额 (Quota):</span>
            <span class="font-mono font-medium text-foreground">
              <NumberRolling :value="overview?.summary?.totalQuota ?? 0" only-up />
            </span>
          </div>
          <div class="text-[11px] text-muted-foreground mt-2">
            换算规则: 500,000 Quota = $1.00 USD
          </div>
        </CardContent>
      </Card>

      <Card class="border-border/60 shadow-xs">
        <CardHeader class="pb-2">
          <CardDescription class="text-xs font-medium">累计处理 Token</CardDescription>
          <CardTitle class="text-2xl font-bold font-mono tracking-tight">
            <NumberRolling :value="overview?.summary?.totalTokens ?? 0" :format-fn="formatTokens" only-up />
          </CardTitle>
        </CardHeader>
        <CardContent class="text-xs text-muted-foreground space-y-1">
          <div class="flex items-center justify-between">
            <span>输入 (Prompt):</span>
            <span class="font-mono text-foreground">
              <NumberRolling :value="overview?.summary?.promptTokens ?? 0" :format-fn="formatTokens" only-up />
            </span>
          </div>
          <div class="flex items-center justify-between">
            <span>输出 (Completion):</span>
            <span class="font-mono text-foreground">
              <NumberRolling :value="overview?.summary?.completionTokens ?? 0" :format-fn="formatTokens" only-up />
            </span>
          </div>
        </CardContent>
      </Card>

      <Card class="border-border/60 shadow-xs">
        <CardHeader class="pb-2">
          <CardDescription class="text-xs font-medium">接入终端与活跃 IP</CardDescription>
          <CardTitle class="text-2xl font-bold font-mono tracking-tight text-blue-600 dark:text-blue-400">
            <NumberRolling :value="overview?.summary?.activeIps ?? 0" suffix="个 IP" only-up />
          </CardTitle>
        </CardHeader>
        <CardContent class="text-xs text-muted-foreground space-y-1">
          <div class="flex items-center justify-between">
            <span>IP 均调用量:</span>
            <span class="font-medium text-foreground">
              <NumberRolling :value="overview?.summary?.avgReqPerIp ?? 0" suffix="次 / IP" only-up />
            </span>
          </div>
          <div class="flex items-center justify-between">
            <span>IP 均消耗额:</span>
            <span class="font-mono text-foreground">
              <NumberRolling :value="overview?.summary?.avgCostPerIp ?? 0" prefix="$" :precision="2" suffix="/ IP" only-up />
            </span>
          </div>
        </CardContent>
      </Card>
    </div>

    <!-- 趋势图与渠道Uptime双列并排 -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- 时序趋势条形分布图 (占 2 列) -->
      <Card class="border-border/60 shadow-xs lg:col-span-2">
        <CardHeader class="pb-2 flex flex-row items-center justify-between">
          <div>
            <CardTitle class="text-base font-semibold">请求与错误分布趋势</CardTitle>
            <CardDescription class="text-xs">
              时间跨度内各时段请求量、异常数与响应延迟走势
            </CardDescription>
          </div>

          <!-- 趋势图模式切换：柱状堆叠 vs 面积流 -->
          <div class="inline-flex rounded-lg border border-border/60 bg-muted/30 p-0.5">
            <Button
              size="xs"
              variant="ghost"
              class="h-6.5 text-xs px-2 rounded-md cursor-pointer transition-all gap-1"
              :class="trendChartType === 'area' ? 'bg-card text-foreground shadow-xs font-semibold' : 'text-muted-foreground hover:text-foreground'"
              @click="trendChartType = 'area'"
              title="面积流图"
            >
              <AreaChart class="size-3.5" />
              <span>面积流</span>
            </Button>
            <Button
              size="xs"
              variant="ghost"
              class="h-6.5 text-xs px-2 rounded-md cursor-pointer transition-all gap-1"
              :class="trendChartType === 'bar' ? 'bg-card text-foreground shadow-xs font-semibold' : 'text-muted-foreground hover:text-foreground'"
              @click="trendChartType = 'bar'"
              title="柱状堆叠图"
            >
              <BarChart3 class="size-3.5" />
              <span>柱状</span>
            </Button>
          </div>
        </CardHeader>
        <CardContent class="pt-2">
          <div v-if="overview?.trend && overview.trend.length > 0" class="h-64 w-full">
            <VChart :option="chartOption" autoresize class="h-full w-full" />
          </div>
          <div v-else class="h-44 flex items-center justify-center text-xs text-muted-foreground">
            所选时段内暂无日志调用
          </div>
        </CardContent>
      </Card>

      <!-- 核心渠道可用率与存活监测矩阵 (占 1 列) -->
      <ChannelUptimePanel
        :channels="overview?.topChannels"
      />
    </div>

    <!-- 核心模型消耗分布 (2列) + 性能健康度面板 (1列) -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div class="lg:col-span-2">
        <ConsumptionDistributionChart
          :distribution="overview?.modelConsumptionDistribution"
        />
      </div>
      <div>
        <PerformanceHealthPanel
          :health="overview?.performanceHealth"
        />
      </div>
    </div>

    <!-- 流式效能对比与响应延迟阶梯 SLA 稳定性透视 -->
    <StreamAndLatencyPanel
      :stream="overview?.streamEfficiency"
      :latency="overview?.latencyBuckets"
    />

    <!-- 最近实时流式日志片段 -->
    <Card class="border-border/60 shadow-xs">
      <CardHeader class="pb-3 flex flex-row items-center justify-between">
        <div>
          <CardTitle class="text-base font-semibold flex items-center gap-2">
            <span>最新实时请求流水</span>
            <Badge v-if="isStreamPaused" variant="outline" class="font-normal text-[11px] border-amber-500/40 text-amber-600 dark:text-amber-400">
              已暂停滚动
            </Badge>
            <Badge v-else variant="secondary" class="font-mono text-xs">
              Live Stream
            </Badge>
          </CardTitle>
          <CardDescription class="text-xs">实时直连捕获的最新调用流水，支持暂停排查与一键提取详情</CardDescription>
        </div>
        <div class="flex items-center gap-2">
          <Button
            variant="outline"
            size="xs"
            class="h-7 text-xs gap-1.5 cursor-pointer"
            :class="isStreamPaused && 'border-amber-500 text-amber-600 dark:text-amber-400 bg-amber-500/10'"
            @click="toggleStreamPause"
          >
            <component :is="isStreamPaused ? Play : Pause" class="size-3.5" />
            <span>{{ isStreamPaused ? '恢复跟随' : '暂停滚动' }}</span>
          </Button>
        </div>
      </CardHeader>
      <CardContent class="p-0">
        <Table>
          <TableHeader>
            <TableRow class="hover:bg-transparent">
              <TableHead class="text-xs">时间</TableHead>
              <TableHead class="text-xs">模型</TableHead>
              <TableHead class="text-xs">渠道</TableHead>
              <TableHead class="text-xs">用户</TableHead>
              <TableHead class="text-xs">IP 地址</TableHead>
              <TableHead class="text-right text-xs">Token</TableHead>
              <TableHead class="text-right text-xs">耗时</TableHead>
              <TableHead class="text-center text-xs">状态</TableHead>
              <TableHead class="text-right text-xs pr-4">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="log in displayLogs" :key="log.id" class="hover:bg-muted/40 group">
              <TableCell class="font-mono text-[11px] text-muted-foreground">{{ log.createdAt }}</TableCell>
              <TableCell class="font-mono text-xs font-medium">{{ log.model }}</TableCell>
              <TableCell class="text-xs text-muted-foreground truncate max-w-[120px]">{{ log.channelName }}</TableCell>
              <TableCell class="text-xs">{{ log.username }}</TableCell>
              <TableCell class="font-mono text-[11px] text-muted-foreground">{{ log.ip }}</TableCell>
              <TableCell class="text-right font-mono text-xs">{{ formatTokens(log.totalTokens) }}</TableCell>
              <TableCell class="text-right font-mono text-xs">{{ log.useTime }}ms</TableCell>
              <TableCell class="text-center">
                <Badge
                  :variant="log.status === 'success' ? 'default' : 'destructive'"
                  class="text-[10px] px-1.5 py-0 h-4"
                  :class="log.status === 'success' && 'bg-emerald-500 hover:bg-emerald-600 text-white border-transparent'"
                >
                  {{ log.status === 'success' ? '200 OK' : '失败' }}
                </Badge>
              </TableCell>
              <TableCell class="text-right pr-4">
                <Button
                  variant="ghost"
                  size="icon"
                  class="size-6 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer text-muted-foreground hover:text-foreground"
                  title="复制单条日志摘要"
                  @click="copyLogDetail(log)"
                >
                  <Copy class="size-3.5" />
                </Button>
              </TableCell>
            </TableRow>
            <TableRow v-if="!displayLogs.length">
              <TableCell colspan="9" class="text-center py-6 text-xs text-muted-foreground">
                暂无请求流水
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  </div>
</template>
