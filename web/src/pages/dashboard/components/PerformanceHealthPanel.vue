<script setup lang="ts">
import { HeartPulse, Timer, Gauge } from '@lucide/vue'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card'
import { Badge } from '@/shared/ui/badge'
import { formatNumber } from '@/shared/lib/utils'

const props = defineProps<{
  health?: {
    systemSuccessRate: number
    avgLatencyMs: number
    tpsTokensPerSec: number
    topModelsHealth: Array<{
      modelName: string
      successRate: number
      count: number
      avgLatency: number
    }>
  }
}>()
</script>

<template>
  <Card class="border-border/60 shadow-xs flex flex-col justify-between">
    <CardHeader class="pb-3 flex flex-row items-center justify-between">
      <div>
        <CardTitle class="text-base font-semibold flex items-center gap-2">
          <HeartPulse class="size-4 text-emerald-500" />
          <span>性能健康度 (Performance Health)</span>
        </CardTitle>
        <CardDescription class="text-xs">
          SLA 服务黄金指标与主力模型质量追踪
        </CardDescription>
      </div>
      <Badge variant="outline" class="font-normal text-[11px] border-emerald-500/30 text-emerald-600 dark:text-emerald-400">
        24H 指标
      </Badge>
    </CardHeader>

    <CardContent class="pt-0 space-y-4">
      <!-- 3 大 SLA 核心指标胶囊 -->
      <div class="grid grid-cols-3 gap-2">
        <div class="bg-muted/40 rounded-xl p-2.5">
          <div class="text-muted-foreground flex items-center gap-1.5 text-[11px] font-medium">
            <HeartPulse class="size-3 text-emerald-500" />
            <span>可用率</span>
          </div>
          <div
            class="mt-1 font-mono text-base font-bold tabular-nums"
            :class="(health?.systemSuccessRate ?? 100) >= 95 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-500'"
          >
            {{ health?.systemSuccessRate ?? 100 }}%
          </div>
        </div>

        <div class="bg-muted/40 rounded-xl p-2.5">
          <div class="text-muted-foreground flex items-center gap-1.5 text-[11px] font-medium">
            <Timer class="size-3 text-sky-500" />
            <span>均延</span>
          </div>
          <div class="mt-1 font-mono text-base font-bold tabular-nums text-foreground">
            {{ health?.avgLatencyMs ?? 0 }}ms
          </div>
        </div>

        <div class="bg-muted/40 rounded-xl p-2.5">
          <div class="text-muted-foreground flex items-center gap-1.5 text-[11px] font-medium">
            <Gauge class="size-3 text-sky-500" />
            <span>吞吐 (TPS)</span>
          </div>
          <div class="mt-1 font-mono text-base font-bold tabular-nums text-sky-600 dark:text-sky-400">
            {{ (health?.tpsTokensPerSec ?? 0).toLocaleString() }}
            <span class="text-[10px] font-normal text-muted-foreground">tok/s</span>
          </div>
        </div>
      </div>

      <!-- 头部模型可用率列表 -->
      <div>
        <div class="text-[11px] font-medium text-muted-foreground mb-1.5">高频模型存活质量</div>
        <div class="divide-y divide-border/30">
          <div
            v-for="m in (health?.topModelsHealth || []).slice(0, 5)"
            :key="m.modelName"
            class="flex items-center justify-between py-1.5 text-xs"
          >
            <div class="flex items-center gap-2 min-w-0 pr-2">
              <span
                class="size-1.5 rounded-full shrink-0"
                :class="m.successRate >= 95 ? 'bg-emerald-500' : m.successRate >= 80 ? 'bg-amber-500' : 'bg-destructive'"
              />
              <span class="font-mono text-[11px] text-foreground truncate max-w-[140px]" :title="m.modelName">
                {{ m.modelName }}
              </span>
            </div>
            <div class="flex items-center gap-3 shrink-0">
              <span class="text-[10px] font-mono text-muted-foreground">{{ m.avgLatency }}ms</span>
              <span
                class="font-mono font-semibold text-xs tabular-nums min-w-[48px] text-right"
                :class="m.successRate >= 95 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-500'"
              >
                {{ m.successRate }}%
              </span>
            </div>
          </div>
        </div>
      </div>
    </CardContent>
  </Card>
</template>
