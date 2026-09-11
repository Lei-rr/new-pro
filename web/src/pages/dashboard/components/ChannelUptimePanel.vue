<script setup lang="ts">
import { computed } from 'vue'
import { Activity, Radio, CheckCircle2, AlertCircle, Clock } from '@lucide/vue'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card'
import { Badge } from '@/shared/ui/badge'
import { formatNumber } from '@/shared/lib/utils'

const props = defineProps<{
  channels?: Array<{
    id: number
    name: string
    count: number
    failed: number
    avgLatency: number
  }>
}>()

const monitorList = computed(() => {
  return (props.channels || []).slice(0, 7).map((c) => {
    const total = c.count || 0
    const failed = c.failed || 0
    const success = Math.max(0, total - failed)
    const uptimePct = total > 0 ? Number(((success / total) * 100).toFixed(1)) : 100
    
    // 状态判定：可用率 >= 95 正常 (绿色)，80~95 降级 (黄色)，< 80 异常 (红色)
    const isDegraded = uptimePct < 95 && uptimePct >= 80
    const isDown = uptimePct < 80

    return {
      id: c.id,
      name: c.name,
      total,
      failed,
      avgLatency: c.avgLatency,
      uptimePct,
      isDegraded,
      isDown,
    }
  })
})
</script>

<template>
  <Card class="border-border/60 shadow-xs flex flex-col justify-between">
    <CardHeader class="pb-3 flex flex-row items-center justify-between">
      <div>
        <CardTitle class="text-base font-semibold flex items-center gap-2">
          <Activity class="size-4 text-emerald-500" />
          <span>核心渠道可用率 (Uptime 矩阵)</span>
        </CardTitle>
        <CardDescription class="text-xs">
          全链路健康探测，各渠道调用质量与可用率百分比
        </CardDescription>
      </div>
      <Badge variant="outline" class="font-normal text-[11px] border-emerald-500/30 text-emerald-600 dark:text-emerald-400">
        实时监测
      </Badge>
    </CardHeader>

    <CardContent class="pt-0 pb-3 flex-1 flex flex-col justify-between">
      <div v-if="monitorList.length > 0" class="divide-y divide-border/40">
        <div
          v-for="m in monitorList"
          :key="m.id"
          class="flex items-center justify-between py-2 text-xs"
        >
          <!-- 渠道名称与指示小圆点 -->
          <div class="flex items-center gap-2 min-w-0 pr-2">
            <span
              class="size-2 rounded-full shrink-0"
              :class="m.isDown ? 'bg-destructive ring-2 ring-destructive/20' : m.isDegraded ? 'bg-amber-500' : 'bg-emerald-500'"
            />
            <span class="font-medium text-foreground truncate max-w-[130px]" :title="m.name">
              {{ m.name }}
            </span>
          </div>

          <!-- 延迟与可用率 -->
          <div class="flex items-center gap-3 shrink-0">
            <span class="text-[11px] font-mono text-muted-foreground">
              {{ m.avgLatency }}ms
            </span>
            <span
              class="font-mono font-semibold text-xs tabular-nums min-w-[50px] text-right"
              :class="m.isDown ? 'text-destructive font-bold' : m.isDegraded ? 'text-amber-500' : 'text-emerald-600 dark:text-emerald-400'"
            >
              {{ m.uptimePct }}%
            </span>
          </div>
        </div>
      </div>

      <div v-else class="h-44 flex items-center justify-center text-xs text-muted-foreground">
        暂无渠道存活数据
      </div>
    </CardContent>
  </Card>
</template>
