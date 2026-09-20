<script setup lang="ts">
import { computed } from 'vue'
import { Activity, CheckCircle2, Clock, Gauge, Layers, Radio, Server, Zap } from '@lucide/vue'
import { Card, CardContent } from '@/shared/ui/card'
import { Badge } from '@/shared/ui/badge'
import { formatTokens } from '@/shared/lib/utils'
import NumberRolling from '@/shared/ui/NumberRolling.vue'
import type { OverviewMetrics, RealtimePulse } from '@/shared/api/types'

const props = defineProps<{
  pulse?: RealtimePulse | null
  overview?: OverviewMetrics | null
}>()

const latencyLevel = computed(() => {
  const latency = props.pulse?.avgLatency1m ?? 0
  if (latency <= 800) return { label: '极速', className: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' }
  if (latency <= 2500) return { label: '良好', className: 'bg-sky-500/10 text-sky-600 dark:text-sky-400' }
  return { label: '较慢', className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' }
})

const tps = computed(() => Math.round((props.pulse?.tpm ?? 0) / 60))
</script>

<template>
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
            当前 QPS:
            <span class="font-medium text-foreground">
              <NumberRolling :value="pulse?.qps ?? 0" :precision="1" />
            </span>
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
            秒级 TPS:
            <span class="font-medium text-foreground">
              <NumberRolling :value="tps" :format-fn="formatTokens" />
            </span>
            tok/s
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
            <span>上游延迟</span>
            <Badge variant="outline" class="text-[9px] px-1 py-0 h-3.5 border-transparent font-normal shrink-0" :class="latencyLevel.className">
              {{ latencyLevel.label }}
            </Badge>
          </div>
          <div class="text-xl sm:text-2xl font-bold mt-1 font-mono text-sky-600 dark:text-sky-400 tracking-tight truncate">
            <NumberRolling :value="pulse?.avgLatency1m ?? 0" suffix="ms" />
          </div>
          <div class="text-[10px] text-muted-foreground mt-0.5 truncate">
            周期均延:
            <span class="font-medium text-foreground">
              <NumberRolling :value="overview?.summary.avgLatencyMs ?? 0" suffix="ms" />
            </span>
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
          <div
            class="text-xl sm:text-2xl font-bold mt-1 font-mono tracking-tight truncate"
            :class="(pulse?.successRate1m ?? 100) < 90 ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400'"
          >
            <NumberRolling :value="pulse?.successRate1m ?? 100" :precision="2" suffix="%" />
          </div>
          <div class="text-[10px] text-muted-foreground mt-0.5 truncate">
            总成功率:
            <span class="font-medium text-foreground">
              <NumberRolling :value="overview?.summary.successRate ?? 100" :precision="2" suffix="%" />
            </span>
          </div>
        </div>
        <div class="size-8 sm:size-9 rounded-lg bg-primary/5 text-primary flex items-center justify-center shrink-0">
          <Server class="size-4 sm:size-5" />
        </div>
      </CardContent>
    </Card>
  </div>
</template>
