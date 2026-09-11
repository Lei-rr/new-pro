<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import {
  AlertTriangle,
  ShieldAlert,
  ShieldCheck,
  Ban,
  Clock,
  Zap,
  Activity,
  ChevronRight,
  Sparkles,
} from '@lucide/vue'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card'
import { Button } from '@/shared/ui/button'
import { Badge } from '@/shared/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table'
import { http } from '@/shared/api/http'
import { toast } from '@/shared/lib/toast'
import { errorMessage } from '@/shared/lib/errors'
import { copyToClipboard } from '@/shared/lib/utils'

const timeRanges = [
  { key: 'today', label: '今天(0点)' },
  { key: '1h', label: '1小时' },
  { key: '6h', label: '6小时' },
  { key: '24h', label: '24小时' },
  { key: '3d', label: '3天内' },
  { key: '7d', label: '7天内' },
]

const currentRange = ref('24h')
const loading = ref(true)
const report = ref<any>(null)

async function loadData() {
  loading.value = true
  try {
    const res = await http.get(`/api/analytics/risks?range=${currentRange.value}`)
    report.value = res
  } catch (err) {
    toast.error(errorMessage(err))
  } finally {
    loading.value = false
  }
}

function selectRange(key: string) {
  currentRange.value = key
  loadData()
}

async function handleCopy(text: string) {
  const ok = await copyToClipboard(text)
  if (ok) {
    toast.success(`已复制: ${text}`)
  } else {
    toast.error('复制失败，请手动选取复制')
  }
}

const healthScore = computed(() => report.value?.summary?.systemHealthScore ?? 100)
const healthColor = computed(() => {
  const score = healthScore.value
  if (score >= 85) return 'text-emerald-500'
  if (score >= 60) return 'text-amber-500'
  return 'text-destructive'
})

let refreshTimer: any = null

// 静默拉取最新数据（不阻断用户当前操作）
async function silentRefresh() {
  try {
    const data = await http.get(`/api/analytics/risks?range=${currentRange.value}`)
    report.value = data
  } catch (_) {}
}

onMounted(() => {
  loadData()
  window.addEventListener('new-pro:refresh', loadData)
  // 停留在本页面时，每 15 秒静默无感自动更新风险指标
  refreshTimer = setInterval(silentRefresh, 15000)
})

onUnmounted(() => {
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = null
  }
  window.removeEventListener('new-pro:refresh', loadData)
})
</script>

<template>
  <div class="space-y-6">
    <!-- 顶栏标题与时间范围选择 -->
    <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 class="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <span>实时风险预警</span>
          <Badge variant="outline" class="font-normal text-xs text-muted-foreground">
            主动治理
          </Badge>
        </h1>
        <p class="text-xs text-muted-foreground mt-1">
          基于全量日志与渠道心跳，自动化扫描高危调用、渠道故障与费用突增（每 15 秒静默实时更新）
        </p>
      </div>

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

    <!-- 风险综合态势卡片 -->
    <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
      <!-- 系统健康度评分 -->
      <Card class="border-border/60 shadow-xs bg-card/70 backdrop-blur-sm">
        <CardContent class="p-5 flex items-center justify-between">
          <div>
            <div class="text-xs text-muted-foreground font-medium">综合健康指数</div>
            <div class="text-3xl font-extrabold font-mono mt-1" :class="healthColor">
              {{ healthScore }}
              <span class="text-xs font-normal text-muted-foreground">/ 100</span>
            </div>
            <div class="text-[11px] text-muted-foreground mt-1">
              {{ healthScore >= 85 ? '系统运行平稳健康' : healthScore >= 60 ? '存在部分亚健康风险' : '存在严重安全或故障风险' }}
            </div>
          </div>
          <div class="size-12 rounded-xl bg-primary/5 flex items-center justify-center">
            <ShieldCheck v-if="healthScore >= 85" class="size-7 text-emerald-500" />
            <ShieldAlert v-else class="size-7 text-destructive" />
          </div>
        </CardContent>
      </Card>

      <!-- 严重风险项 -->
      <Card class="border-border/60 shadow-xs">
        <CardContent class="p-5 flex items-center justify-between">
          <div>
            <div class="text-xs text-muted-foreground font-medium">严重 / 紧急警报</div>
            <div class="text-3xl font-bold font-mono mt-1 text-destructive">
              {{ report?.summary?.criticalCount ?? 0 }}
              <span class="text-xs font-normal text-muted-foreground">项</span>
            </div>
            <div class="text-[11px] text-muted-foreground mt-1">
              高危告警: {{ report?.summary?.highCount ?? 0 }} 项
            </div>
          </div>
          <div class="size-10 rounded-lg bg-destructive/10 text-destructive flex items-center justify-center">
            <AlertTriangle class="size-5" />
          </div>
        </CardContent>
      </Card>

      <!-- 高危 IP 数量 -->
      <Card class="border-border/60 shadow-xs">
        <CardContent class="p-5 flex items-center justify-between">
          <div>
            <div class="text-xs text-muted-foreground font-medium">检出高危可疑 IP</div>
            <div class="text-3xl font-bold font-mono mt-1 text-amber-500">
              {{ report?.highRiskIps?.length ?? 0 }}
              <span class="text-xs font-normal text-muted-foreground">个</span>
            </div>
            <div class="text-[11px] text-muted-foreground mt-1">
              建议及时加入封禁黑名单
            </div>
          </div>
          <div class="size-10 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center">
            <Ban class="size-5" />
          </div>
        </CardContent>
      </Card>

      <!-- 异常渠道数 -->
      <Card class="border-border/60 shadow-xs">
        <CardContent class="p-5 flex items-center justify-between">
          <div>
            <div class="text-xs text-muted-foreground font-medium">高故障率上游渠道</div>
            <div class="text-3xl font-bold font-mono mt-1 text-foreground">
              {{ report?.failingChannels?.length ?? 0 }}
              <span class="text-xs font-normal text-muted-foreground">个</span>
            </div>
            <div class="text-[11px] text-muted-foreground mt-1">
              错误率高或已发生熔断
            </div>
          </div>
          <div class="size-10 rounded-lg bg-primary/5 text-primary flex items-center justify-center">
            <Activity class="size-5" />
          </div>
        </CardContent>
      </Card>
    </div>

    <!-- 风险预警事件列表 (Alerts Feed) -->
    <Card class="border-border/60 shadow-xs">
      <CardHeader class="pb-3 flex flex-row items-center justify-between">
        <div>
          <CardTitle class="text-base font-semibold flex items-center gap-2">
            <span>智能风险预警建议 (AI Analysis & Insights)</span>
            <Badge variant="secondary" class="font-mono text-xs">
              {{ report?.alerts?.length ?? 0 }} 项预警
            </Badge>
          </CardTitle>
          <CardDescription class="text-xs">
            由分析引擎根据吞吐模式、失败激增及异常成本特征生成的排查诊断建议
          </CardDescription>
        </div>
      </CardHeader>

      <CardContent class="p-0">
        <div class="divide-y divide-border/60">
          <div
            v-for="alert in report?.alerts ?? []"
            :key="alert.id"
            class="p-4 transition-colors hover:bg-muted/30 flex flex-col sm:flex-row sm:items-start gap-4"
          >
            <!-- 警报级别徽章 -->
            <div class="shrink-0 mt-0.5">
              <Badge
                :variant="alert.severity === 'critical' ? 'destructive' : alert.severity === 'high' ? 'destructive' : 'outline'"
                class="text-[11px] px-2"
              >
                {{ alert.severity.toUpperCase() }}
              </Badge>
            </div>

            <!-- 内容与处置建议 -->
            <div class="flex-1 space-y-1.5">
              <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                <div class="font-semibold text-sm text-foreground flex items-center gap-2">
                  <span>{{ alert.title }}</span>
                  <Badge variant="secondary" class="text-[10px] font-mono font-normal">
                    {{ alert.target }}
                  </Badge>
                </div>
                <span class="text-[11px] text-muted-foreground font-mono">
                  检测值: <strong class="text-foreground">{{ alert.metricValue }}</strong> ({{ alert.threshold }})
                </span>
              </div>

              <p class="text-xs text-muted-foreground leading-relaxed">
                {{ alert.description }}
              </p>

              <!-- 治理建议提示条 -->
              <div class="rounded-md bg-muted/50 border border-border/40 p-2.5 text-xs text-foreground flex items-start gap-2">
                <Sparkles class="size-4 text-amber-500 shrink-0 mt-0.5" />
                <div class="leading-relaxed">
                  <strong class="font-medium">治理建议：</strong>{{ alert.suggestion }}
                </div>
              </div>
            </div>
          </div>

          <div v-if="!report?.alerts?.length" class="p-8 text-center text-xs text-muted-foreground">
            🎉 当前监控周期内未发现严重风险事件，系统状态极佳！
          </div>
        </div>
      </CardContent>
    </Card>

    <!-- 下半部分两表：高危 IP 拦截建议 & 高故障率渠道详情 -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- 高危 IP 列表 -->
      <Card class="border-border/60 shadow-xs">
        <CardHeader class="pb-3 flex flex-row items-center justify-between">
          <div>
            <CardTitle class="text-base font-semibold">恶意刷量 / 突发高频 IP 拦截</CardTitle>
            <CardDescription class="text-xs">
              自动化识别恶意高频撞库、短时暴增突刺与死循环调用，支持一键排查
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent class="p-0">
          <Table>
            <TableHeader>
              <TableRow class="hover:bg-transparent">
                <TableHead class="text-xs">IP 来源与特征</TableHead>
                <TableHead class="text-center text-xs">风险类别</TableHead>
                <TableHead class="text-right text-xs">请求总量 / 短时突发</TableHead>
                <TableHead class="text-right text-xs">失败率</TableHead>
                <TableHead class="text-right text-xs pr-4">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="ip in report?.highRiskIps ?? []" :key="ip.ip" class="hover:bg-muted/40 group">
                <TableCell class="text-xs">
                  <div class="flex items-center gap-1.5">
                    <span class="font-mono font-semibold text-foreground">{{ ip.ip }}</span>
                    <Badge v-if="ip.severity === 'critical'" variant="destructive" class="text-[9px] px-1 py-0 h-3.5">
                      紧急
                    </Badge>
                  </div>
                  <div class="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                    {{ ip.riskReason }}
                  </div>
                  <div v-if="ip.modelsUsed?.length" class="text-[10px] text-muted-foreground/80 mt-0.5 font-mono">
                    涉及模型: {{ ip.modelsUsed.join(', ') }}
                  </div>
                </TableCell>
                <TableCell class="text-center">
                  <Badge
                    v-if="ip.riskType === 'brushing'"
                    class="text-[10px] px-1.5 py-0 h-4 bg-destructive text-destructive-foreground border-transparent"
                  >
                    恶意刷接口
                  </Badge>
                  <Badge
                    v-else-if="ip.riskType === 'relay_hijack'"
                    class="text-[10px] px-1.5 py-0 h-4 border-amber-500/40 text-amber-600 dark:text-amber-400 bg-amber-500/10"
                    variant="outline"
                  >
                    中转站接走
                  </Badge>
                  <Badge
                    v-else-if="ip.riskType === 'massive_volume'"
                    class="text-[10px] px-1.5 py-0 h-4 border-purple-500/40 text-purple-600 dark:text-purple-400 bg-purple-500/10"
                    variant="outline"
                  >
                    天量请求
                  </Badge>
                  <Badge
                    v-else
                    variant="secondary"
                    class="text-[10px] px-1.5 py-0 h-4"
                  >
                    高频并发
                  </Badge>
                </TableCell>
                <TableCell class="text-right font-mono text-xs">
                  <div class="font-semibold">{{ ip.requestCount.toLocaleString() }} 次</div>
                  <div v-if="ip.costUsd && ip.costUsd >= 10" class="text-[10px] text-purple-600 dark:text-purple-400 font-semibold">
                    ${{ ip.costUsd.toFixed(2) }}
                  </div>
                  <div v-else-if="ip.burst1m" class="text-[10px] text-amber-600 dark:text-amber-400">
                    1m: +{{ ip.burst1m }} 次
                  </div>
                </TableCell>
                <TableCell class="text-right font-mono text-xs">
                  <Badge
                    :variant="ip.failureRate >= 50 ? 'destructive' : 'outline'"
                    class="text-[10px] px-1.5 py-0 h-4"
                    :class="ip.failureRate < 50 && 'text-muted-foreground border-border'"
                  >
                    {{ ip.failureRate }}%
                  </Badge>
                </TableCell>
                <TableCell class="text-right pr-4">
                  <Button variant="ghost" size="xs" class="h-7 text-xs cursor-pointer gap-1" @click="handleCopy(ip.ip)">
                    <Copy class="size-3" />
                    <span>复制IP</span>
                  </Button>
                </TableCell>
              </TableRow>
              <TableRow v-if="!report?.highRiskIps?.length">
                <TableCell colspan="5" class="text-center py-6 text-xs text-muted-foreground">
                  暂未检测到异常可疑 IP
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <!-- 故障渠道排查 -->
      <Card class="border-border/60 shadow-xs">
        <CardHeader class="pb-3">
          <CardTitle class="text-base font-semibold">不稳定上游渠道追踪</CardTitle>
          <CardDescription class="text-xs">
            调用报错率过高或超长超时的上游供应商渠道
          </CardDescription>
        </CardHeader>
        <CardContent class="p-0">
          <Table>
            <TableHeader>
              <TableRow class="hover:bg-transparent">
                <TableHead class="text-xs">渠道名称</TableHead>
                <TableHead class="text-right text-xs">失败数 / 总数</TableHead>
                <TableHead class="text-right text-xs">失败率</TableHead>
                <TableHead class="text-right text-xs">平均延迟</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="c in report?.failingChannels ?? []" :key="c.id" class="hover:bg-muted/40">
                <TableCell class="text-xs">
                  <div class="font-medium text-foreground">{{ c.name }}</div>
                  <div class="text-[10px] text-destructive truncate max-w-[200px] mt-0.5">
                    {{ c.lastErrorMessage }}
                  </div>
                </TableCell>
                <TableCell class="text-right font-mono text-xs">
                  {{ c.failedRequests }} / {{ c.totalRequests }}
                </TableCell>
                <TableCell class="text-right font-mono text-xs">
                  <Badge variant="destructive" class="text-[10px] px-1.5 py-0 h-4">
                    {{ c.errorRate }}%
                  </Badge>
                </TableCell>
                <TableCell class="text-right font-mono text-xs">
                  {{ c.avgLatency }}ms
                </TableCell>
              </TableRow>
              <TableRow v-if="!report?.failingChannels?.length">
                <TableCell colspan="4" class="text-center py-6 text-xs text-muted-foreground">
                  暂无高故障率渠道，上游链路稳定
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  </div>
</template>
