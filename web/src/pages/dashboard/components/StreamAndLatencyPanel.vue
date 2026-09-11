<script setup lang="ts">
import { Zap, Radio, Clock, ShieldCheck } from '@lucide/vue'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card'
import { Badge } from '@/shared/ui/badge'
import { Progress } from '@/shared/ui/progress'
import { formatNumber, formatTokens } from '@/shared/lib/utils'

const props = defineProps<{
  stream?: {
    streamCount: number
    nonStreamCount: number
    streamPercentage: number
    streamAvgLatency: number
    nonStreamAvgLatency: number
    streamTokens: number
    nonStreamTokens: number
  }
  latency?: {
    fastCount: number
    normalCount: number
    slowCount: number
    timeoutCount: number
    fastPct: number
    normalPct: number
    slowPct: number
    timeoutPct: number
  }
}>()
</script>

<template>
  <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
    <!-- 卡片 1：流式 vs 非流式效能对比 -->
    <Card class="border-border/60 shadow-xs">
      <CardHeader class="pb-3 flex flex-row items-center justify-between">
        <div>
          <CardTitle class="text-base font-semibold flex items-center gap-2">
            <Radio class="size-4 text-sky-500" />
            <span>流式吞吐效能透视 (SSE Stream vs Non-Stream)</span>
          </CardTitle>
          <CardDescription class="text-xs">
            打字机打流与传统阻塞调用的流量占比与响应延迟差异
          </CardDescription>
        </div>
        <Badge variant="secondary" class="font-mono text-xs">
          {{ stream?.streamPercentage ?? 0 }}% 流式率
        </Badge>
      </CardHeader>

      <CardContent class="pt-0 space-y-4">
        <!-- 进度对比条 -->
        <div>
          <div class="flex items-center justify-between text-xs mb-1.5">
            <span class="text-muted-foreground flex items-center gap-1">
              <span class="size-2 rounded-full bg-sky-500"></span>
              流式调用 ({{ stream?.streamPercentage ?? 0 }}%)
            </span>
            <span class="text-muted-foreground flex items-center gap-1">
              普通阻塞 ({{ Number((100 - (stream?.streamPercentage ?? 0)).toFixed(1)) }}%)
              <span class="size-2 rounded-full bg-slate-300 dark:bg-slate-700"></span>
            </span>
          </div>
          <div class="h-2 w-full bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden flex">
            <div class="bg-sky-500 h-full transition-all" :style="{ width: `${stream?.streamPercentage ?? 0}%` }"></div>
            <div class="bg-slate-300 dark:bg-slate-700 h-full flex-1"></div>
          </div>
        </div>

        <!-- 详细指标格 -->
        <div class="grid grid-cols-2 gap-3 pt-1">
          <div class="bg-muted/30 rounded-lg p-3 border border-border/40">
            <div class="text-[11px] text-muted-foreground font-medium flex items-center gap-1">
              <Zap class="size-3 text-sky-500" />
              流式请求详情
            </div>
            <div class="text-lg font-mono font-bold mt-1 text-foreground">
              {{ formatNumber(stream?.streamCount ?? 0) }} <span class="text-xs font-normal text-muted-foreground">次</span>
            </div>
            <div class="text-[11px] text-muted-foreground mt-1 flex justify-between">
              <span>平均均延:</span>
              <span class="font-mono font-semibold text-foreground">{{ stream?.streamAvgLatency ?? 0 }}ms</span>
            </div>
            <div class="text-[11px] text-muted-foreground mt-0.5 flex justify-between">
              <span>承载Token:</span>
              <span class="font-mono font-semibold text-foreground">{{ formatTokens(stream?.streamTokens ?? 0) }}</span>
            </div>
          </div>

          <div class="bg-muted/30 rounded-lg p-3 border border-border/40">
            <div class="text-[11px] text-muted-foreground font-medium flex items-center gap-1">
              <Clock class="size-3 text-slate-500" />
              非流式普通调用
            </div>
            <div class="text-lg font-mono font-bold mt-1 text-foreground">
              {{ formatNumber(stream?.nonStreamCount ?? 0) }} <span class="text-xs font-normal text-muted-foreground">次</span>
            </div>
            <div class="text-[11px] text-muted-foreground mt-1 flex justify-between">
              <span>平均均延:</span>
              <span class="font-mono font-semibold text-foreground">{{ stream?.nonStreamAvgLatency ?? 0 }}ms</span>
            </div>
            <div class="text-[11px] text-muted-foreground mt-0.5 flex justify-between">
              <span>承载Token:</span>
              <span class="font-mono font-semibold text-foreground">{{ formatTokens(stream?.nonStreamTokens ?? 0) }}</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>

    <!-- 卡片 2：响应延迟阶梯 SLA 稳定性分布 -->
    <Card class="border-border/60 shadow-xs">
      <CardHeader class="pb-3 flex flex-row items-center justify-between">
        <div>
          <CardTitle class="text-base font-semibold flex items-center gap-2">
            <ShieldCheck class="size-4 text-emerald-500" />
            <span>延迟阶梯分布透视 (Latency SLA)</span>
          </CardTitle>
          <CardDescription class="text-xs">
            摆脱单一平均值误差，全量监控极速响应与长尾超时分布
          </CardDescription>
        </div>
        <Badge variant="outline" class="font-mono text-xs border-emerald-500/30 text-emerald-600 dark:text-emerald-400">
          SLA 阶梯
        </Badge>
      </CardHeader>

      <CardContent class="pt-0 space-y-3">
        <!-- 阶梯 1: <500ms 极速 -->
        <div>
          <div class="flex items-center justify-between text-xs mb-1">
            <span class="flex items-center gap-1.5 font-medium">
              <span class="size-2 rounded-full bg-emerald-500"></span>
              ⚡ 极速响应 (&lt; 500ms)
            </span>
            <span class="font-mono text-xs text-muted-foreground">
              <span class="font-semibold text-foreground">{{ formatNumber(latency?.fastCount ?? 0) }}</span> 次 ({{ latency?.fastPct ?? 0 }}%)
            </span>
          </div>
          <Progress class="h-1.5" :model-value="latency?.fastPct ?? 100" />
        </div>

        <!-- 阶梯 2: 500ms~1.5s 正常 -->
        <div>
          <div class="flex items-center justify-between text-xs mb-1">
            <span class="flex items-center gap-1.5 font-medium">
              <span class="size-2 rounded-full bg-sky-500"></span>
              🟢 正常响应 (500ms ~ 1.5s)
            </span>
            <span class="font-mono text-xs text-muted-foreground">
              <span class="font-semibold text-foreground">{{ formatNumber(latency?.normalCount ?? 0) }}</span> 次 ({{ latency?.normalPct ?? 0 }}%)
            </span>
          </div>
          <Progress class="h-1.5" :model-value="latency?.normalPct ?? 0" />
        </div>

        <!-- 阶梯 3: 1.5s~3s 较慢 -->
        <div>
          <div class="flex items-center justify-between text-xs mb-1">
            <span class="flex items-center gap-1.5 font-medium">
              <span class="size-2 rounded-full bg-amber-500"></span>
              🟡 较慢长尾 (1.5s ~ 3s)
            </span>
            <span class="font-mono text-xs text-muted-foreground">
              <span class="font-semibold text-foreground">{{ formatNumber(latency?.slowCount ?? 0) }}</span> 次 ({{ latency?.slowPct ?? 0 }}%)
            </span>
          </div>
          <Progress class="h-1.5" :model-value="latency?.slowPct ?? 0" />
        </div>

        <!-- 阶梯 4: >3s 极慢 -->
        <div>
          <div class="flex items-center justify-between text-xs mb-1">
            <span class="flex items-center gap-1.5 font-medium">
              <span class="size-2 rounded-full bg-destructive"></span>
              🔴 极慢卡顿 (&gt; 3s)
            </span>
            <span class="font-mono text-xs text-muted-foreground">
              <span class="font-semibold text-foreground">{{ formatNumber(latency?.timeoutCount ?? 0) }}</span> 次 ({{ latency?.timeoutPct ?? 0 }}%)
            </span>
          </div>
          <Progress class="h-1.5" :model-value="latency?.timeoutPct ?? 0" />
        </div>
      </CardContent>
    </Card>
  </div>
</template>
