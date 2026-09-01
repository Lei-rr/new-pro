<script setup lang="ts">
import { computed, onMounted, watch } from 'vue';
import { ChevronLeft, ChevronRight, Search } from '@lucide/vue';
import { useLogsStore } from '@/stores/logs';
import { useAppStore } from '@/stores/app';
import { useRealtimeStore } from '@/stores/realtime';
import { formatCost, formatDateTime, formatNumber, formatTime } from '@/lib/formatters';
import type { RawLogEntry, RawLogKind } from '@/api/types';
import LogDetailDrawer from './LogDetailDrawer.vue';

const store = useLogsStore();
const app = useAppStore();
const realtime = useRealtimeStore();

onMounted(() => {
  store.search(true);
  realtime.onLogs((entries) => store.appendLive(entries));
});

watch(() => app.rangeHours, () => store.search(true));

const KINDS: Array<{ value: RawLogKind; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'consume', label: '计费' },
  { value: 'gin', label: 'HTTP' },
  { value: 'error', label: '错误' },
  { value: 'sys', label: '系统' },
];

const totalPages = computed(() => Math.max(1, Math.ceil(store.total / store.limit)));
const currentPage = computed(() => Math.floor(store.offset / store.limit) + 1);

function consumeDetail(l: RawLogEntry): Record<string, unknown> {
  return (l.detail as Record<string, unknown>) ?? {};
}

function typeBadge(l: RawLogEntry): { label: string; class: string } {
  switch (l.kind) {
    case 'consume':
      return { label: '计费', class: 'bg-sky-500/10 text-sky-600 dark:text-sky-400' };
    case 'gin':
      return l.success
        ? { label: 'HTTP', class: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' }
        : { label: 'HTTP', class: 'bg-red-500/10 text-red-600 dark:text-red-400' };
    case 'error':
      return { label: '错误', class: 'bg-red-500/10 text-red-600 dark:text-red-400' };
    case 'sys':
      return { label: '系统', class: 'bg-muted text-muted-foreground' };
    default:
      return { label: '信息', class: 'bg-muted text-muted-foreground' };
  }
}

let searchTimer: ReturnType<typeof setTimeout> | null = null;
function onSearchInput(v: string): void {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => store.setQuery(v), 350);
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <!-- 工具栏 -->
    <Card class="gap-3 p-3 sm:p-4">
      <div class="flex flex-col gap-2 lg:flex-row lg:items-center">
        <div class="relative flex-1">
          <Search class="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            :model-value="store.q"
            class="h-8 pl-8 text-xs"
            placeholder="搜索模型 / 令牌 / 用户 / IP / 路径 / 请求ID…"
            @update:model-value="onSearchInput"
          />
        </div>
        <div class="flex items-center gap-1.5 overflow-x-auto">
          <Button
            v-for="k in KINDS"
            :key="k.value"
            variant="outline"
            size="sm"
            class="h-8 shrink-0 text-xs"
            :class="store.kind === k.value ? 'border-primary text-foreground' : ''"
            @click="store.setKind(k.value)"
          >
            {{ k.label }}
          </Button>
        </div>
      </div>
    </Card>

    <!-- NewAPI 风格日志表格 -->
    <Card class="p-0">
      <div class="flex items-center justify-between border-b border-border px-4 py-3">
        <p class="text-xs text-muted-foreground">
          共 <span class="font-medium text-foreground tabular-nums">{{ formatNumber(store.total) }}</span> 条日志
        </p>
        <span class="flex items-center gap-1.5 text-[11px]" :class="realtime.connected ? 'text-emerald-500' : 'text-muted-foreground'">
          <span class="size-1.5 rounded-full bg-current" />
          {{ realtime.connected ? 'LIVE' : '离线' }}
        </span>
      </div>

      <div class="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow class="hover:bg-transparent">
              <TableHead class="w-20 whitespace-nowrap text-xs">时间</TableHead>
              <TableHead class="w-16 whitespace-nowrap text-xs">类型</TableHead>
              <TableHead class="w-16 whitespace-nowrap text-xs">渠道</TableHead>
              <TableHead class="max-w-40 text-xs">模型</TableHead>
              <TableHead class="w-20 whitespace-nowrap text-right text-xs">提示Tokens</TableHead>
              <TableHead class="w-20 whitespace-nowrap text-right text-xs">补全Tokens</TableHead>
              <TableHead class="w-16 whitespace-nowrap text-right text-xs">倍率</TableHead>
              <TableHead class="w-20 whitespace-nowrap text-right text-xs">缓存Tokens</TableHead>
              <TableHead class="w-24 whitespace-nowrap text-right text-xs">额度</TableHead>
              <TableHead class="w-16 whitespace-nowrap text-xs">用户</TableHead>
              <TableHead class="max-w-56 text-xs">详情</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow
              v-for="l in store.entries"
              :key="`${l.timestamp}-${l.requestId}-${l.message.slice(0, 12)}`"
              class="cursor-pointer"
              @click="store.select(l)"
            >
              <TableCell class="whitespace-nowrap font-mono text-[11px] text-muted-foreground">
                {{ formatTime(l.timestamp) }}
              </TableCell>
              <TableCell>
                <span class="rounded-md px-1.5 py-0.5 text-[10px] font-medium" :class="typeBadge(l).class">
                  {{ typeBadge(l).label }}
                </span>
              </TableCell>
              <TableCell class="text-xs tabular-nums text-muted-foreground">
                {{ consumeDetail(l).channelId != null ? `#${consumeDetail(l).channelId}` : '—' }}
              </TableCell>
              <TableCell class="max-w-40 truncate text-xs font-medium">
                {{ consumeDetail(l).model ?? '—' }}
              </TableCell>
              <TableCell class="whitespace-nowrap text-right text-xs tabular-nums">
                {{ consumeDetail(l).promptTokens != null ? formatNumber(consumeDetail(l).promptTokens as number) : '—' }}
              </TableCell>
              <TableCell class="whitespace-nowrap text-right text-xs tabular-nums">
                {{ consumeDetail(l).completionTokens != null ? formatNumber(consumeDetail(l).completionTokens as number) : '—' }}
              </TableCell>
              <TableCell class="whitespace-nowrap text-right text-xs tabular-nums text-muted-foreground">
                {{ consumeDetail(l).modelRatio != null ? `×${consumeDetail(l).modelRatio}` : '—' }}
              </TableCell>
              <TableCell class="whitespace-nowrap text-right text-xs tabular-nums text-muted-foreground">
                {{ consumeDetail(l).cacheTokens != null ? formatNumber(consumeDetail(l).cacheTokens as number) : '—' }}
              </TableCell>
              <TableCell class="whitespace-nowrap text-right text-xs font-medium tabular-nums">
                {{ consumeDetail(l).quota != null ? formatNumber(consumeDetail(l).quota as number) : '—' }}
              </TableCell>
              <TableCell class="text-xs tabular-nums text-muted-foreground">
                {{ consumeDetail(l).userId != null ? `#${consumeDetail(l).userId}` : '—' }}
              </TableCell>
              <TableCell class="max-w-56 truncate text-[11px] text-muted-foreground">
                {{ l.message }}
              </TableCell>
            </TableRow>
            <TableRow v-if="!store.loading && !store.entries.length">
              <TableCell colspan="11" class="py-12 text-center text-xs text-muted-foreground">暂无日志</TableCell>
            </TableRow>
          </TableBody>
        </Table>
        <div v-if="store.loading" class="flex flex-col gap-1 border-t border-border py-2">
          <Skeleton v-for="i in 8" :key="i" class="h-6 w-full" />
        </div>
      </div>

      <!-- 分页 -->
      <div class="flex items-center justify-between border-t border-border px-4 py-3">
        <p class="text-[11px] text-muted-foreground tabular-nums">
          第 {{ currentPage }} / {{ totalPages }} 页
        </p>
        <div class="flex items-center gap-1">
          <Button variant="outline" size="icon-xs" :disabled="currentPage <= 1" @click="store.goTo(currentPage - 1)">
            <ChevronLeft class="size-3.5" />
          </Button>
          <Button variant="outline" size="icon-xs" :disabled="currentPage >= totalPages" @click="store.goTo(currentPage + 1)">
            <ChevronRight class="size-3.5" />
          </Button>
        </div>
      </div>
    </Card>

    <LogDetailDrawer />
  </div>
</template>
