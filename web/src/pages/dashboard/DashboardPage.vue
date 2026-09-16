<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import {
  Activity,
  CheckCircle2,
  XCircle,
  Gauge,
  Layers,
  Clock,
  Radio,
  Server,
  Zap,
  Pause,
  Play,
  Copy,
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
import { formatTokens, copyToClipboard } from '@/shared/lib/utils'
import { useSessionStore } from '@/features/auth'
import { TIME_RANGES } from '@/shared/constants/time-ranges'
import { useAutoRefresh } from '@/shared/composables/useAutoRefresh'
import NumberRolling from '@/shared/ui/NumberRolling.vue'
import ChannelUptimePanel from './components/ChannelUptimePanel.vue'
import ConsumptionDistributionChart from './components/ConsumptionDistributionChart.vue'
import PerformanceHealthPanel from './components/PerformanceHealthPanel.vue'
import StreamAndLatencyPanel from './components/StreamAndLatencyPanel.vue'
import TrendMetricsChart from './components/TrendMetricsChart.vue'

const currentRange = ref('today')
const loading = ref(true)
const overview = ref<any>(null)
const sessionStore = useSessionStore()

const { pulse } = useRealtimePulse()

// 跟踪已累加的流水 ID 集合与已知 IP/用户集合
const processedLogIds = new Set<number>()
const knownIps = new Set<string>()
const knownUsers = new Set<string>()
let lastBaseLogId = 0

// 监听 WebSocket 推送的实时流水，前端实时平滑累加指标
watch(
  () => pulse.value?.recentLogs,
  (logs) => {
    if (!logs || !logs.length || !overview.value?.summary) return
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

      if (log.ip && log.ip !== '-' && !knownIps.has(log.ip)) {
        knownIps.add(log.ip)
        addedIps += 1
      }

      if (log.username && log.username !== '系统' && !knownUsers.has(log.username)) {
        knownUsers.add(log.username)
        addedUsers += 1
      }
    }

    if (processedLogIds.size > 2000) {
      const arr = Array.from(processedLogIds)
      processedLogIds.clear()
      arr.slice(-1000).forEach((id) => processedLogIds.add(id))
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
      if (summary.activeIps > 0) {
        summary.avgReqPerIp = Math.round(summary.totalRequests / summary.activeIps)
        summary.avgCostPerIp = Number((summary.totalCostUsd / summary.activeIps).toFixed(2))
      }
      if (addedUsers > 0) {
        summary.activeUsers = (summary.activeUsers || 0) + addedUsers
      }
      if (summary.totalRequests > 0) {
        summary.successRate = Number(((summary.successRequests / summary.totalRequests) * 100).toFixed(2))
      }
    }
  },
  { deep: true }
)

// 流水暂停/冻结机制
const isStreamPaused = ref(false)
const frozenLogs = ref<any[]>([])

const displayLogs = computed(() => {
  if (isStreamPaused.value) {
    return frozenLogs.value
  }
  return pulse.value?.recentLogs ?? []
})

function toggleStreamPause() {
  if (!isStreamPaused.value) {
    frozenLogs.value = [...(pulse.value?.recentLogs ?? [])]
    isStreamPaused.value = true
    toast.info('实时流水已暂停')
  } else {
    isStreamPaused.value = false
    toast.success('已恢复实时流水跟随')
  }
}

async function copyLogDetail(log: any) {
  const ipText = log.ip ? (log.ipLocation ? `${log.ip} (${log.ipLocation})` : log.ip) : '-'
  const text = `[NewAPI 日志] 时间: ${log.createdAt} | 模型: ${log.model} | 渠道: ${log.channelName} | 用户: ${log.username} | IP: ${ipText} | Token: ${log.totalTokens} | 耗时: ${log.useTime}ms | 状态: ${log.status}`
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

    if (ovData?.knownIpList?.length) {
      ovData.knownIpList.forEach((ip: string) => {
        if (ip) knownIps.add(ip)
      })
    } else if (ovData?.topIps?.length) {
      ovData.topIps.forEach((item: any) => {
        if (item.ip) knownIps.add(item.ip)
      })
    }

    if (silent && overview.value?.summary && ovData?.summary) {
      ovData.summary.totalRequests = Math.max(ovData.summary.totalRequests || 0, overview.value.summary.totalRequests || 0)
      ovData.summary.successRequests = Math.max(ovData.summary.successRequests || 0, overview.value.summary.successRequests || 0)
      ovData.summary.failedRequests = Math.max(ovData.summary.failedRequests || 0, overview.value.summary.failedRequests || 0)
      ovData.summary.totalQuota = Math.max(ovData.summary.totalQuota || 0, overview.value.summary.totalQuota || 0)
      ovData.summary.totalCostUsd = Number((ovData.summary.totalQuota / 500000).toFixed(4))
      ovData.summary.totalTokens = Math.max(ovData.summary.totalTokens || 0, overview.value.summary.totalTokens || 0)
      ovData.summary.promptTokens = Math.max(ovData.summary.promptTokens || 0, overview.value.summary.promptTokens || 0)
      ovData.summary.completionTokens = Math.max(ovData.summary.completionTokens || 0, overview.value.summary.completionTokens || 0)
      ovData.summary.activeIps = Math.max(ovData.summary.activeIps || 0, overview.value.summary.activeIps || 0)
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
  lastBaseLogId = 0
  processedLogIds.clear()
  knownIps.clear()
  knownUsers.clear()
  loadData()
}

// 自动后台静默校准，离开页面自动释放
const calibMs = (sessionStore.calibrationIntervalSec || 60) * 1000
useAutoRefresh(() => loadData(true), {
  intervalMs: calibMs,
  onRefreshEvent: () => loadData(false),
})

// 首屏加载
loadData()
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

    <!-- 实时指标横幅 -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-3">
      <Card class="border-border/60 shadow-xs bg-card/60 backdrop-blur-sm overflow-hidden">
        <CardContent class="p-3 sm:p-4 flex items-center justify-between gap-2">
          <div class="min-w-0 flex-1">
            <div class="text-[11px] text-muted-foreground font-medium flex items-center gap-1.5 truncate">
              <Radio class="size-3.5 text-emerald-500 animate-pulse shrink-0" />
              <span>实时吞吐 (RPM)</span>
            </div>
            <div class="text-xl sm:text-2xl font-bold mt-1 font-mono tracking-tight truncate">
              <NumberRolling :value="pulse?.rpm ?? 0" suffix="req/min" />
            </div>
            <div class="text-[10px] text-muted-foreground mt-0.5 truncate">
              当前 QPS: <span class="font-medium text-foreground"><NumberRolling :value="pulse?.qps ?? 0" :precision="1" /></span>
            </div>
          </div>
          <div class="size-8 sm:size-9 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
            <Zap class="size-4 sm:size-5" />
          </div>
        </CardContent>
      </Card>

      <Card class="border-border/60 shadow-xs bg-card/60 backdrop-blur-sm overflow-hidden">
        <CardContent class="p-3 sm:p-4 flex items-center justify-between gap-2">
          <div class="min-w-0 flex-1">
            <div class="text-[11px] text-muted-foreground font-medium flex items-center gap-1.5 truncate">
              <Activity class="size-3.5 text-blue-500 shrink-0" />
              <span>Token 吞吐 (TPM)</span>
            </div>
            <div class="text-xl sm:text-2xl font-bold mt-1 font-mono text-blue-600 dark:text-blue-400 tracking-tight truncate">
              <NumberRolling :value="pulse?.tpm ?? 0" :format-fn="formatTokens" suffix="tok/min" />
            </div>
            <div class="text-[10px] text-muted-foreground mt-0.5 truncate">
              秒级 TPS: <span class="font-medium text-foreground"><NumberRolling :value="Math.round((pulse?.tpm ?? 0) / 60)" :format-fn="formatTokens" /></span> tok/s
            </div>
          </div>
          <div class="size-8 sm:size-9 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center shrink-0">
            <Layers class="size-4 sm:size-5" />
          </div>
        </CardContent>
      </Card>

      <Card class="border-border/60 shadow-xs bg-card/60 backdrop-blur-sm overflow-hidden">
        <CardContent class="p-3 sm:p-4 flex items-center justify-between gap-2">
          <div class="min-w-0 flex-1">
            <div class="text-[11px] text-muted-foreground font-medium flex items-center gap-1.5 truncate">
              <Clock class="size-3.5 text-sky-500 shrink-0" />
              <span class="truncate">上游延迟</span>
              <Badge
                variant="outline"
                class="text-[9px] px-1 py-0 h-3.5 border-transparent font-normal shrink-0"
                :class="(pulse?.avgLatency1m ?? 0) <= 800 ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : ((pulse?.avgLatency1m ?? 0) <= 2500 ? 'bg-sky-500/10 text-sky-600 dark:text-sky-400' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400')"
              >
                {{ (pulse?.avgLatency1m ?? 0) <= 800 ? '极速' : ((pulse?.avgLatency1m ?? 0) <= 2500 ? '良好' : '较慢') }}
              </Badge>
            </div>
            <div class="text-xl sm:text-2xl font-bold mt-1 font-mono text-sky-600 dark:text-sky-400 tracking-tight truncate">
              <NumberRolling :value="pulse?.avgLatency1m ?? 0" suffix="ms" />
            </div>
            <div class="text-[10px] text-muted-foreground mt-0.5 truncate">
              周期均延: <span class="font-medium text-foreground"><NumberRolling :value="overview?.summary?.avgLatencyMs ?? 0" suffix="ms" /></span>
            </div>
          </div>
          <div class="size-8 sm:size-9 rounded-lg bg-sky-500/10 text-sky-500 flex items-center justify-center shrink-0">
            <Gauge class="size-4 sm:size-5" />
          </div>
        </CardContent>
      </Card>

      <Card class="border-border/60 shadow-xs bg-card/60 backdrop-blur-sm overflow-hidden">
        <CardContent class="p-3 sm:p-4 flex items-center justify-between gap-2">
          <div class="min-w-0 flex-1">
            <div class="text-[11px] text-muted-foreground font-medium flex items-center gap-1.5 truncate">
              <CheckCircle2 class="size-3.5 text-emerald-500 shrink-0" />
              <span>1分钟成功率</span>
            </div>
            <div class="text-xl sm:text-2xl font-bold mt-1 font-mono tracking-tight truncate" :class="(pulse?.successRate1m ?? 100) < 90 ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400'">
              <NumberRolling :value="pulse?.successRate1m ?? 100" :precision="2" suffix="%" />
            </div>
            <div class="text-[10px] text-muted-foreground mt-0.5 truncate">
              总成功率: <span class="font-medium text-foreground"><NumberRolling :value="Number(overview?.summary?.successRate ?? 100)" :precision="2" suffix="%" /></span>
            </div>
          </div>
          <div class="size-8 sm:size-9 rounded-lg bg-primary/5 text-primary flex items-center justify-center shrink-0">
            <Server class="size-4 sm:size-5" />
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
          <div class="flex items-center justify-between gap-2 mt-2">
            <Progress class="h-1.5 flex-1" :model-value="overview?.summary?.successRate ?? 100" />
            <span class="text-[10px] text-muted-foreground font-mono shrink-0">
              <NumberRolling :value="pulse?.qps ?? 0" :precision="1" /> req/s
            </span>
          </div>
        </CardContent>
      </Card>

      <Card class="border-border/60 shadow-xs">
        <CardHeader class="pb-2">
          <CardDescription class="text-xs font-medium">消耗总金额 (USD)</CardDescription>
          <CardTitle class="text-2xl font-bold font-mono tracking-tight text-emerald-600 dark:text-emerald-400">
            <NumberRolling :value="overview?.summary?.totalCostUsd ?? 0" prefix="$" :precision="2" only-up />
          </CardTitle>
        </CardHeader>
        <CardContent class="text-xs text-muted-foreground space-y-1">
          <div class="flex items-center justify-between">
            <span>折合配额 (Quota):</span>
            <span class="font-mono font-medium text-foreground">
              <NumberRolling :value="overview?.summary?.totalQuota ?? 0" only-up />
            </span>
          </div>
          <div class="flex items-center justify-between">
            <span>千次调用均价:</span>
            <span class="font-mono font-medium text-emerald-600 dark:text-emerald-400">
              <NumberRolling
                :value="(overview?.summary?.totalRequests ?? 0) > 0 ? Number(((overview?.summary?.totalCostUsd ?? 0) / (overview?.summary?.totalRequests) * 1000).toFixed(4)) : 0"
                prefix="$"
                :precision="4"
                suffix="/ 1k"
                only-up
              />
            </span>
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
            <span>实时活跃 (5m / 30m):</span>
            <span class="font-medium text-foreground">
              <NumberRolling :value="pulse?.activeIps5m ?? 0" />
              <span class="text-muted-foreground/60 mx-1">/</span>
              <NumberRolling :value="pulse?.activeIps30m ?? 0" suffix="IP" />
            </span>
          </div>
          <div class="flex items-center justify-between">
            <span>IP 均调用量:</span>
            <span class="font-mono text-foreground">
              <NumberRolling :value="overview?.summary?.avgReqPerIp ?? 0" suffix="次 / IP" only-up />
            </span>
          </div>
        </CardContent>
      </Card>
    </div>

    <!-- 趋势图与渠道可用率并排 -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <TrendMetricsChart :trend="overview?.trend" />
      <ChannelUptimePanel :channels="overview?.topChannels" />
    </div>

    <!-- 核心模型消耗分布 (2列) + 性能健康度面板 (1列) -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div class="lg:col-span-2">
        <ConsumptionDistributionChart :distribution="overview?.modelConsumptionDistribution" />
      </div>
      <div>
        <PerformanceHealthPanel :health="overview?.performanceHealth" />
      </div>
    </div>

    <!-- 流式效能对比与响应延迟阶梯 -->
    <StreamAndLatencyPanel :stream="overview?.streamEfficiency" :latency="overview?.latencyBuckets" />

    <!-- 最近实时流水表格 -->
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
          <CardDescription class="text-xs">实时捕获的最新调用流水，支持暂停排查与一键提取详情</CardDescription>
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
              <TableHead class="text-xs">IP / 归属地</TableHead>
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
              <TableCell class="font-mono text-[11px] text-muted-foreground">
                <div class="text-foreground">{{ log.ip || '-' }}</div>
                <div v-if="log.ipLocation" class="text-[10px] text-muted-foreground truncate max-w-[130px]" :title="log.ipLocation">
                  {{ log.ipLocation }}
                </div>
              </TableCell>
              <TableCell class="text-right font-mono text-xs">{{ formatTokens(log.totalTokens) }}</TableCell>
              <TableCell class="text-right font-mono text-xs">{{ log.useTime }}ms</TableCell>
              <TableCell class="text-center">
                <Badge
                  :variant="log.status === 'success' ? 'default' : 'destructive'"
                  class="text-[10px] px-1.5 py-0 h-4"
                  :class="log.status === 'success' && 'bg-emerald-500 hover:bg-emerald-600 text-white border-transparent'"
                  :title="log.status === 'failed' ? (log.errorDetail || log.errorCode || '请求异常') : '请求成功'"
                >
                  {{ log.status === 'success' ? '200 OK' : (log.errorCode ? `${log.errorCode} 失败` : '失败') }}
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
