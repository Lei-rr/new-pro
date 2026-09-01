<script setup lang="ts">
import { computed, onMounted, watch } from 'vue';
import { ChevronLeft, ChevronRight, Search } from '@lucide/vue';
import { useLogsStore } from '@/stores/logs';
import { useAppStore } from '@/stores/app';
import { useRealtimeStore } from '@/stores/realtime';
import { formatDateTime, formatNumber, formatTime } from '@/lib/formatters';
import type { RawLogKind, RawLogEntry } from '@/api/types';
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
  { value: 'success', label: '成功' },
  { value: 'failure', label: '失败' },
  { value: 'gin', label: 'HTTP' },
  { value: 'consume', label: '计费' },
  { value: 'error', label: '错误' },
];

const totalPages = computed(() => Math.max(1, Math.ceil(store.total / store.limit)));
const currentPage = computed(() => Math.floor(store.offset / store.limit) + 1);

function levelClass(e: RawLogEntry): string {
  if (e.kind === 'error') return 'text-red-600 dark:text-red-400';
  if (e.kind === 'gin') return e.success ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400';
  if (e.kind === 'consume') return 'text-sky-600 dark:text-sky-400';
  return 'text-muted-foreground';
}

function levelLabel(e: RawLogEntry): string {
  if (e.kind === 'error') return 'ERR';
  if (e.kind === 'gin') return e.success ? 'OK' : 'HTTP';
  if (e.kind === 'consume') return '计费';
  if (e.kind === 'sys') return 'SYS';
  return 'INFO';
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
            placeholder="搜索模型 / 令牌 / IP / 路径…"
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

    <!-- 日志流 -->
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

      <!-- 流式列表（NewAPI 原始日志风格） -->
      <div class="flex flex-col font-mono text-[11px]">
        <button
          v-for="l in store.entries"
          :key="`${l.timestamp}-${l.requestId}-${l.message.slice(0, 16)}`"
          class="flex items-start gap-3 px-4 py-2 text-left transition-colors odd:bg-muted/30 hover:bg-muted/60"
          @click="store.select(l)"
        >
          <span class="w-16 shrink-0 text-muted-foreground">{{ formatTime(l.timestamp) }}</span>
          <span class="w-12 shrink-0 font-semibold" :class="levelClass(l)">{{ levelLabel(l) }}</span>
          <span class="min-w-0 flex-1 break-all text-foreground/90">{{ l.message }}</span>
        </button>
        <div v-if="!store.loading && !store.entries.length" class="py-12 text-center text-xs text-muted-foreground">
          暂无日志
        </div>
        <div v-if="store.loading" class="flex flex-col gap-1 py-2">
          <Skeleton v-for="i in 8" :key="i" class="h-5 w-full" />
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
