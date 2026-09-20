<script setup lang="ts">
import { computed, ref } from 'vue'
import { Ban, ShieldAlert, ShieldCheck, Sparkles } from '@lucide/vue'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card'
import { Button } from '@/shared/ui/button'
import { Badge } from '@/shared/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table'
import { analyticsApi } from '@/shared/api/endpoints'
import { toast } from '@/shared/lib/toast'
import { errorMessage } from '@/shared/lib/errors'
import { copyToClipboard } from '@/shared/lib/utils'
import { RISK_TIME_RANGES } from '@/shared/constants/time-ranges'
import { useAutoRefresh } from '@/shared/composables/useAutoRefresh'
import type { HighRiskIpType, RiskReport, TimeRangeKey } from '@/shared/api/types'

const RISK_TYPE_LABELS: Record<HighRiskIpType, string> = {
  brushing: '恶意死循环',
  relay_hijack: '中转站套娃',
  massive_volume: '单IP天量',
}

const currentRange = ref<TimeRangeKey>('today')
const loading = ref(true)
const report = ref<RiskReport | null>(null)

async function loadData(silent = false): Promise<void> {
  if (!silent) loading.value = true
  try {
    report.value = await analyticsApi.risks(currentRange.value)
  } catch (err) {
    if (!silent) toast.error(errorMessage(err))
  } finally {
    if (!silent) loading.value = false
  }
}

function selectRange(key: TimeRangeKey): void {
  if (key === currentRange.value) return
  currentRange.value = key
  void loadData()
}

async function copyTarget(text: string): Promise<void> {
  if (await copyToClipboard(text)) toast.success(`已复制: ${text}`)
  else toast.error('复制失败，请手动选取复制')
}

const healthScore = computed(() => report.value?.summary.systemHealthScore ?? 100)
const healthColor = computed(() => {
  if (healthScore.value >= 85) return 'text-emerald-500'
  if (healthScore.value >= 60) return 'text-amber-500'
  return 'text-destructive'
})
const healthLabel = computed(() => {
  if (healthScore.value >= 85) return { text: '健康稳定', variant: 'default' as const }
  if (healthScore.value >= 60) return { text: '关注预警', variant: 'secondary' as const }
  return { text: '高危告警', variant: 'destructive' as const }
})
const healthHint = computed(() => {
  if (healthScore.value >= 85) return '整体运行稳定，未探测到大面积故障或严重攻击'
  if (healthScore.value >= 60) return '存在部分异常抖动，建议关注下方高危列表'
  return '检测到高危攻击或渠道中断，请尽快处置'
})

useAutoRefresh(() => loadData(true), {
  intervalMs: 15000,
  onManualRefresh: () => loadData(false),
})

void loadData()
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 class="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <span>实时风险预警</span>
          <Badge variant="outline" class="font-normal text-xs text-muted-foreground">主动治理</Badge>
        </h1>
        <p class="text-xs text-muted-foreground mt-1">
          基于全量日志与渠道心跳，自动化扫描高危调用、渠道故障与费用突增（每 15 秒静默实时更新）
        </p>
      </div>

      <div class="inline-flex max-w-full overflow-x-auto no-scrollbar rounded-lg border border-border/60 bg-muted/30 p-1">
        <Button
          v-for="item in RISK_TIME_RANGES"
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

    <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
      <Card class="border-border/60 shadow-xs md:col-span-2">
        <CardContent class="p-4 sm:p-5 flex items-center justify-between gap-4">
          <div class="space-y-1">
            <div class="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
              <ShieldCheck v-if="healthScore >= 80" class="size-4 text-emerald-500" />
              <ShieldAlert v-else class="size-4 text-amber-500" />
              <span>当前系统综合健康评分</span>
            </div>
            <div class="text-3xl sm:text-4xl font-extrabold font-mono tracking-tight" :class="healthColor">
              {{ healthScore }}
              <span class="text-xs text-muted-foreground font-sans font-normal ml-1">/ 100 分</span>
            </div>
            <p class="text-xs text-muted-foreground pt-1">{{ healthHint }}</p>
          </div>

          <div class="flex flex-col items-end gap-1.5 shrink-0">
            <Badge :variant="healthLabel.variant" class="text-xs px-2 py-0.5 font-medium">
              {{ healthLabel.text }}
            </Badge>
            <span class="text-[11px] text-muted-foreground font-mono">
              共触发 {{ report?.summary.totalAlerts ?? 0 }} 项规则
            </span>
          </div>
        </CardContent>
      </Card>

      <Card class="border-border/60 shadow-xs">
        <CardHeader class="pb-2">
          <CardDescription class="text-xs font-medium">阻断 / 异常 IP</CardDescription>
          <CardTitle class="text-2xl font-bold font-mono tracking-tight text-destructive">
            {{ report?.summary.abnormalIpCount ?? 0 }}
            <span class="text-xs text-muted-foreground font-sans font-normal">个终端</span>
          </CardTitle>
        </CardHeader>
        <CardContent class="text-xs text-muted-foreground">
          <div class="flex items-center justify-between">
            <span>高危严重:</span>
            <span class="font-mono font-medium text-destructive">{{ report?.summary.criticalCount ?? 0 }}</span>
          </div>
          <div class="flex items-center justify-between mt-1">
            <span>需关注:</span>
            <span class="font-mono font-medium text-amber-500">{{ report?.summary.highCount ?? 0 }}</span>
          </div>
        </CardContent>
      </Card>

      <Card class="border-border/60 shadow-xs">
        <CardHeader class="pb-2">
          <CardDescription class="text-xs font-medium">故障渠道阻断</CardDescription>
          <CardTitle
            class="text-2xl font-bold font-mono tracking-tight"
            :class="(report?.summary.unhealthyChannelCount ?? 0) > 0 ? 'text-amber-500' : 'text-emerald-600 dark:text-emerald-400'"
          >
            {{ report?.summary.unhealthyChannelCount ?? 0 }}
            <span class="text-xs text-muted-foreground font-sans font-normal">条上游</span>
          </CardTitle>
        </CardHeader>
        <CardContent class="text-xs text-muted-foreground">
          <div class="flex items-center justify-between">
            <span>中级预警:</span>
            <span class="font-mono font-medium text-muted-foreground">{{ report?.summary.mediumCount ?? 0 }}</span>
          </div>
          <div class="flex items-center justify-between mt-1">
            <span>低风险波动:</span>
            <span class="font-mono font-medium text-muted-foreground">{{ report?.summary.lowCount ?? 0 }}</span>
          </div>
        </CardContent>
      </Card>
    </div>

    <Card class="border-border/60 shadow-xs">
      <CardHeader class="pb-3 flex flex-row items-center justify-between">
        <div>
          <CardTitle class="text-base font-semibold flex items-center gap-2">
            <span>当前激活的风险策略告警</span>
            <Badge variant="secondary" class="text-xs font-mono">{{ report?.alerts.length ?? 0 }}</Badge>
          </CardTitle>
          <CardDescription class="text-xs">由后端风控引擎自动化计算触发的异常特征行为，支持针对性快速处置</CardDescription>
        </div>
      </CardHeader>
      <CardContent class="p-0">
        <div class="divide-y divide-border/60">
          <div
            v-for="alert in report?.alerts"
            :key="alert.id"
            class="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-start justify-between gap-4 hover:bg-muted/30 transition-colors"
          >
            <div class="space-y-1.5 flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <Badge
                  :variant="alert.severity === 'critical' ? 'destructive' : alert.severity === 'high' ? 'secondary' : 'outline'"
                  class="text-[10px] px-1.5 py-0 h-4 uppercase font-semibold"
                >
                  {{ alert.severity }}
                </Badge>
                <h3 class="text-sm font-bold text-foreground">{{ alert.title }}</h3>
                <span class="text-xs text-muted-foreground font-mono">目标: {{ alert.target }}</span>
              </div>
              <p class="text-xs text-muted-foreground leading-relaxed">{{ alert.description }}</p>
              <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs pt-1">
                <span class="text-muted-foreground">
                  实际观测值: <span class="font-mono text-foreground font-semibold">{{ alert.metricValue }}</span>
                </span>
                <span class="text-muted-foreground">
                  触发容忍线: <span class="font-mono text-muted-foreground">{{ alert.threshold }}</span>
                </span>
              </div>
            </div>

            <div class="sm:max-w-xs w-full p-3 rounded-lg bg-muted/40 border border-border/40 text-xs space-y-1.5 shrink-0">
              <div class="font-semibold text-foreground flex items-center gap-1.5">
                <Sparkles class="size-3.5 text-amber-500" />
                <span>处置建议</span>
              </div>
              <p class="text-[11px] text-muted-foreground leading-relaxed">{{ alert.suggestion }}</p>
            </div>
          </div>

          <div v-if="!report?.alerts.length" class="p-8 text-center text-xs text-muted-foreground">
            {{ loading ? '正在执行风控扫描...' : '所选时间段内系统运行良好，未触发任何风控拦截规则' }}
          </div>
        </div>
      </CardContent>
    </Card>

    <Card class="border-border/60 shadow-xs">
      <CardHeader class="pb-3 flex flex-row items-center justify-between">
        <div>
          <CardTitle class="text-base font-semibold flex items-center gap-2">
            <span>高危 IP 拦截与封禁建议清单</span>
            <Badge variant="outline" class="text-xs font-mono">Top {{ report?.highRiskIps.length ?? 0 }}</Badge>
          </CardTitle>
          <CardDescription class="text-xs">
            针对破坏性死循环探测、恶意刷量与高频中转套娃行为，一键复制 IP 并建议拉黑
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent class="p-0">
        <Table>
          <TableHeader>
            <TableRow class="hover:bg-transparent">
              <TableHead class="text-xs font-semibold">IP 地址 / 归属地</TableHead>
              <TableHead class="text-xs font-semibold">危害特征</TableHead>
              <TableHead class="text-right text-xs font-semibold">总请求</TableHead>
              <TableHead class="text-right text-xs font-semibold">失败数</TableHead>
              <TableHead class="text-right text-xs font-semibold">失败率</TableHead>
              <TableHead class="text-xs font-semibold">涉及模型</TableHead>
              <TableHead class="text-xs font-semibold">最近活动</TableHead>
              <TableHead class="text-right text-xs font-semibold pr-4">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="item in report?.highRiskIps" :key="item.ip" class="hover:bg-muted/40">
              <TableCell class="font-mono text-xs font-semibold text-foreground">
                <div class="flex items-center gap-1.5 flex-wrap">
                  <span>{{ item.ip }}</span>
                  <Badge
                    v-if="item.location"
                    variant="outline"
                    class="text-[10px] font-normal px-1 py-0 h-4 border-sky-500/30 text-sky-600 dark:text-sky-400"
                  >
                    {{ item.location }}
                  </Badge>
                </div>
              </TableCell>
              <TableCell class="text-xs max-w-xs">
                <div class="flex items-center gap-1.5 flex-wrap">
                  <Badge
                    :variant="item.severity === 'critical' ? 'destructive' : 'secondary'"
                    class="text-[10px] px-1.5 py-0 h-4"
                  >
                    {{ RISK_TYPE_LABELS[item.riskType] }}
                  </Badge>
                  <span class="text-muted-foreground text-[11px] truncate" :title="item.riskReason">
                    {{ item.riskReason }}
                  </span>
                </div>
              </TableCell>
              <TableCell class="text-right font-mono text-xs font-semibold">{{ item.requestCount }}</TableCell>
              <TableCell class="text-right font-mono text-xs text-rose-500">{{ item.failedCount }}</TableCell>
              <TableCell class="text-right font-mono text-xs">
                <Badge
                  :variant="item.failureRate >= 70 ? 'destructive' : item.failureRate >= 40 ? 'secondary' : 'outline'"
                  class="text-[10px] px-1.5 py-0 h-4 font-mono"
                >
                  {{ item.failureRate }}%
                </Badge>
              </TableCell>
              <TableCell class="text-xs text-muted-foreground font-mono truncate max-w-[120px]">
                {{ item.modelsUsed?.join(', ') || '-' }}
              </TableCell>
              <TableCell class="text-xs text-muted-foreground whitespace-nowrap">{{ item.lastSeen }}</TableCell>
              <TableCell class="text-right pr-4">
                <Button
                  variant="outline"
                  size="xs"
                  class="h-6 text-xs gap-1 cursor-pointer text-destructive hover:bg-destructive/10 border-destructive/30"
                  @click="copyTarget(item.ip)"
                >
                  <Ban class="size-3" />
                  <span>复制拉黑</span>
                </Button>
              </TableCell>
            </TableRow>
            <TableRow v-if="!report?.highRiskIps.length">
              <TableCell colspan="8" class="text-center py-8 text-xs text-muted-foreground">
                {{ loading ? '正在加载风控数据...' : '所选时段内无异常高危 IP 终端' }}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  </div>
</template>
