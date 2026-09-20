<script setup lang="ts">
import { computed } from 'vue'
import { CheckCircle2, XCircle } from '@lucide/vue'
import { Card, CardContent, CardHeader, CardDescription, CardTitle } from '@/shared/ui/card'
import { Progress } from '@/shared/ui/progress'
import { formatTokens } from '@/shared/lib/utils'
import NumberRolling from '@/shared/ui/NumberRolling.vue'
import type { OverviewMetrics, RealtimePulse } from '@/shared/api/types'

const props = defineProps<{
  overview?: OverviewMetrics | null
  pulse?: RealtimePulse | null
}>()

const costPerThousand = computed(() => {
  const summary = props.overview?.summary
  if (!summary || summary.totalRequests <= 0) return 0
  return Number(((summary.totalCostUsd / summary.totalRequests) * 1000).toFixed(4))
})
</script>

<template>
  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
    <Card class="border-border/60 shadow-xs">
      <CardHeader class="pb-2">
        <CardDescription class="text-xs font-medium">总请求调用量</CardDescription>
        <CardTitle class="text-2xl font-bold font-mono tracking-tight">
          <NumberRolling :value="overview?.summary.totalRequests ?? 0" only-up />
        </CardTitle>
      </CardHeader>
      <CardContent class="text-xs text-muted-foreground">
        <div class="flex items-center justify-between pt-1">
          <span class="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 class="size-3" />
            成功 <NumberRolling :value="overview?.summary.successRequests ?? 0" only-up />
          </span>
          <span class="flex items-center gap-1 text-destructive">
            <XCircle class="size-3" />
            失败 <NumberRolling :value="overview?.summary.failedRequests ?? 0" only-up />
          </span>
        </div>
        <div class="flex items-center justify-between gap-2 mt-2">
          <Progress class="h-1.5 flex-1" :model-value="overview?.summary.successRate ?? 100" />
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
          <NumberRolling :value="overview?.summary.totalCostUsd ?? 0" prefix="$" :precision="2" only-up />
        </CardTitle>
      </CardHeader>
      <CardContent class="text-xs text-muted-foreground space-y-1">
        <div class="flex items-center justify-between">
          <span>折合配额 (Quota):</span>
          <span class="font-mono font-medium text-foreground">
            <NumberRolling :value="overview?.summary.totalQuota ?? 0" only-up />
          </span>
        </div>
        <div class="flex items-center justify-between">
          <span>千次调用均价:</span>
          <span class="font-mono font-medium text-emerald-600 dark:text-emerald-400">
            <NumberRolling :value="costPerThousand" prefix="$" :precision="4" suffix="/ 1k" only-up />
          </span>
        </div>
      </CardContent>
    </Card>

    <Card class="border-border/60 shadow-xs">
      <CardHeader class="pb-2">
        <CardDescription class="text-xs font-medium">累计处理 Token</CardDescription>
        <CardTitle class="text-2xl font-bold font-mono tracking-tight">
          <NumberRolling :value="overview?.summary.totalTokens ?? 0" :format-fn="formatTokens" only-up />
        </CardTitle>
      </CardHeader>
      <CardContent class="text-xs text-muted-foreground space-y-1">
        <div class="flex items-center justify-between">
          <span>输入 (Prompt):</span>
          <span class="font-mono text-foreground">
            <NumberRolling :value="overview?.summary.promptTokens ?? 0" :format-fn="formatTokens" only-up />
          </span>
        </div>
        <div class="flex items-center justify-between">
          <span>输出 (Completion):</span>
          <span class="font-mono text-foreground">
            <NumberRolling :value="overview?.summary.completionTokens ?? 0" :format-fn="formatTokens" only-up />
          </span>
        </div>
      </CardContent>
    </Card>

    <Card class="border-border/60 shadow-xs">
      <CardHeader class="pb-2">
        <CardDescription class="text-xs font-medium">接入终端与活跃 IP</CardDescription>
        <CardTitle class="text-2xl font-bold font-mono tracking-tight text-blue-600 dark:text-blue-400">
          <NumberRolling :value="overview?.summary.activeIps ?? 0" suffix="个 IP" only-up />
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
            <NumberRolling :value="overview?.summary.avgReqPerIp ?? 0" suffix="次 / IP" only-up />
          </span>
        </div>
      </CardContent>
    </Card>
  </div>
</template>
