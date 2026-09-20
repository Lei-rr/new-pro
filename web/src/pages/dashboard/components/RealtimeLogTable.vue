<script setup lang="ts">
import { computed, ref } from 'vue'
import { Pause, Play } from '@lucide/vue'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card'
import { Badge } from '@/shared/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table'
import { toast } from '@/shared/lib/toast'
import { formatTokens, QUOTA_PER_USD } from '@/shared/lib/utils'
import type { RealtimeLog } from '@/shared/api/types'

const props = defineProps<{
  logs: RealtimeLog[]
}>()

/**
 * 耗时相关展示规则，与 NewAPI 保持一致：
 * - 格式：<60s 显示「17.0s」，>=60s 显示「2m 30s」
 * - 总耗时配色：输出 token >= 100 时按吞吐率判定，否则按时长
 * - 首字配色：<5s 绿、<10s 黄、其余红
 */
const DURATION_LIMITS = { warningSec: 10, dangerSec: 30 } as const
const FIRST_TOKEN_LIMITS = { warningSec: 5, dangerSec: 10 } as const
const THROUGHPUT_LIMITS = { good: 30, fair: 15 } as const
const THROUGHPUT_MIN_TOKENS = 100

type Level = 'success' | 'warning' | 'danger'

function formatDuration(ms: number): string {
  const seconds = ms / 1000
  if (seconds < 60) return `${seconds.toFixed(1)}s`
  return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`
}

function durationLevel(seconds: number): Level {
  if (seconds < DURATION_LIMITS.warningSec) return 'success'
  if (seconds < DURATION_LIMITS.dangerSec) return 'warning'
  return 'danger'
}

/** 吞吐率分级：每秒生成 token 数越高越好 */
function throughputLevel(tokensPerSecond: number): Level {
  if (tokensPerSecond >= THROUGHPUT_LIMITS.good) return 'success'
  if (tokensPerSecond >= THROUGHPUT_LIMITS.fair) return 'warning'
  return 'danger'
}

/**
 * 总耗时配色：输出 token 足够多时以吞吐率衡量（更能反映生成效率），
 * 否则退化为纯时长判断，与 NewAPI 的 getResponseTimeColor 一致。
 */
function totalTimeLevel(useTimeMs: number, completionTokens: number): Level {
  const seconds = useTimeMs / 1000
  if (completionTokens < THROUGHPUT_MIN_TOKENS || seconds <= 0) return durationLevel(seconds)
  return throughputLevel(completionTokens / seconds)
}

function firstTokenLevel(ms: number): Level {
  const seconds = ms / 1000
  if (seconds < FIRST_TOKEN_LIMITS.warningSec) return 'success'
  if (seconds < FIRST_TOKEN_LIMITS.dangerSec) return 'warning'
  return 'danger'
}

const LEVEL_CLASS: Record<Level, string> = {
  success: 'text-emerald-600 dark:text-emerald-400',
  warning: 'text-amber-500',
  danger: 'text-destructive',
}

/** NewAPI 额度换算为美元，小额保留更多精度 */
function formatCost(quota: number): string {
  if (!quota || quota <= 0) return '-'
  const usd = quota / QUOTA_PER_USD
  return `$${usd < 0.01 ? usd.toFixed(4) : usd.toFixed(3)}`
}

const paused = ref(false)
/** 暂停瞬间的快照，暂停期间固定不变 */
const frozenLogs = ref<RealtimeLog[]>([])

const displayLogs = computed<RealtimeLog[]>(() => (paused.value ? frozenLogs.value : props.logs))

function togglePause(): void {
  if (paused.value) {
    paused.value = false
    toast.success('已恢复实时流水跟随')
    return
  }
  frozenLogs.value = [...props.logs]
  paused.value = true
  toast.info('实时流水已暂停')
}

</script>

<template>
  <Card class="border-border/60 shadow-xs">
    <CardHeader class="pb-3 flex flex-row items-center justify-between">
      <div>
        <CardTitle class="text-base font-semibold flex items-center gap-2">
          <span>最新实时请求流水</span>
          <Badge v-if="paused" variant="outline" class="font-normal text-[11px] border-amber-500/40 text-amber-600 dark:text-amber-400">
            已暂停滚动
          </Badge>
          <Badge v-else variant="secondary" class="font-mono text-xs">Live Stream</Badge>
        </CardTitle>
        <CardDescription class="text-xs">实时捕获的最新调用流水，支持暂停排查</CardDescription>
      </div>
      <Button
        variant="outline"
        size="xs"
        class="h-7 text-xs gap-1.5 cursor-pointer"
        :class="paused && 'border-amber-500 text-amber-600 dark:text-amber-400 bg-amber-500/10'"
        @click="togglePause"
      >
        <component :is="paused ? Play : Pause" class="size-3.5" />
        <span>{{ paused ? '恢复跟随' : '暂停滚动' }}</span>
      </Button>
    </CardHeader>
    <CardContent class="p-0">
      <Table>
        <TableHeader>
          <TableRow class="hover:bg-transparent">
            <TableHead class="text-xs">时间</TableHead>
            <TableHead class="text-xs">渠道</TableHead>
            <TableHead class="text-xs">令牌</TableHead>
            <TableHead class="text-xs">模型</TableHead>
            <TableHead class="text-xs">IP</TableHead>
            <TableHead class="text-center text-xs">流</TableHead>
            <TableHead class="text-right text-xs">Tokens</TableHead>
            <TableHead class="text-right text-xs">费用</TableHead>
            <TableHead class="text-right text-xs pr-4">耗时</TableHead>
            <TableHead class="text-center text-xs">状态</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-for="log in displayLogs" :key="log.id" class="hover:bg-muted/40 group">
            <TableCell class="font-mono text-[11px] text-muted-foreground whitespace-nowrap">
              {{ log.createdAt }}
            </TableCell>
            <TableCell class="text-xs">
              <div class="truncate max-w-[130px]" :title="log.channelName">{{ log.channelName }}</div>
            </TableCell>
            <TableCell class="text-xs">
              <div class="truncate max-w-[90px] text-muted-foreground" :title="log.tokenName">
                {{ log.tokenName }}
              </div>
            </TableCell>
            <TableCell class="text-xs">
              <div class="font-mono font-medium truncate max-w-[170px]" :title="log.model">{{ log.model }}</div>
            </TableCell>
            <TableCell class="text-xs">
              <div class="font-mono text-[11px] text-foreground truncate max-w-[120px]">{{ log.ip || '-' }}</div>
              <div
                v-if="log.ipLocation"
                class="text-[10px] text-muted-foreground truncate max-w-[120px]"
                :title="log.ipLocation"
              >
                {{ log.ipLocation }}
              </div>
            </TableCell>
            <TableCell class="text-center">
              <Badge
                :variant="log.isStream ? 'secondary' : 'outline'"
                class="text-[10px] px-1.5 py-0 h-4 font-mono"
                :class="log.isStream && 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-transparent'"
              >
                {{ log.isStream ? '流式' : '同步' }}
              </Badge>
            </TableCell>
            <!-- Tokens：第一行输入/输出，有缓存命中时补充第二行 -->
            <TableCell class="text-right font-mono text-xs whitespace-nowrap">
              <div>{{ formatTokens(log.promptTokens) }} / {{ formatTokens(log.completionTokens) }}</div>
              <div v-if="log.cacheTokens > 0" class="text-[10px] text-muted-foreground">
                缓存↓ {{ formatTokens(log.cacheTokens) }}
              </div>
            </TableCell>
            <TableCell class="text-right font-mono text-[11px] text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
              {{ formatCost(log.quota) }}
            </TableCell>
            <!--
              耗时：有首字延迟时两行（首字 + 总耗时），否则单行。
              配色按 NewAPI 规则：总耗时看吞吐率或时长，首字看绝对秒数。
            -->
            <TableCell class="text-right font-mono text-xs whitespace-nowrap pr-4">
              <div v-if="log.firstTokenMs !== undefined" class="flex items-baseline justify-end gap-1.5">
                <span class="text-[10px] text-muted-foreground">首字</span>
                <span :class="LEVEL_CLASS[firstTokenLevel(log.firstTokenMs)]">
                  {{ formatDuration(log.firstTokenMs) }}
                </span>
              </div>
              <div class="flex items-baseline justify-end gap-1.5">
                <span class="text-[10px] text-muted-foreground">耗时</span>
                <span :class="LEVEL_CLASS[totalTimeLevel(log.useTime, log.completionTokens)]">
                  {{ formatDuration(log.useTime) }}
                </span>
              </div>
            </TableCell>
            <TableCell class="text-center">
              <Badge
                :variant="log.status === 'success' ? 'default' : 'destructive'"
                class="text-[10px] px-1.5 py-0 h-4 whitespace-nowrap"
                :class="log.status === 'success' && 'bg-emerald-500 hover:bg-emerald-600 text-white border-transparent'"
                :title="log.status === 'failed' ? (log.errorDetail || log.errorCode || '请求异常') : '请求成功'"
              >
                {{ log.status === 'success' ? '200 OK' : log.errorCode ? `${log.errorCode} 失败` : '失败' }}
              </Badge>
            </TableCell>
          </TableRow>
          <TableRow v-if="!displayLogs.length">
            <TableCell colspan="10" class="text-center py-6 text-xs text-muted-foreground">暂无请求流水</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </CardContent>
  </Card>
</template>
