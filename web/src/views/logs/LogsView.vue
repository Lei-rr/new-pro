<script setup lang="ts">
import { computed, onMounted, watch } from 'vue';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, RefreshCw, Search } from '@lucide/vue';
import { useLogsStore } from '@/stores/logs';
import { useAppStore } from '@/stores/app';
import { useRealtimeStore } from '@/stores/realtime';
import { formatNumber, formatTime } from '@/lib/formatters';
import type { RawLogEntry, RawLogKind } from '@/api/types';
import LogDetailDrawer from './LogDetailDrawer.vue';

const store = useLogsStore();
const app = useAppStore();
const realtime = useRealtimeStore();

onMounted(() => {
  store.search(true);
  realtime.onLogs((entries) => store.appendLive(entries));
});

watch(() => app.rangeDays, () => store.search(true));

const KINDS: Array<{ value: RawLogKind; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'consume', label: '计费' },
  { value: 'error', label: '错误' },
  { value: 'sys', label: '系统' },
];

const totalPages = computed(() => Math.max(1, Math.ceil(store.total / store.limit)));
const currentPage = computed(() => Math.floor(store.offset / store.limit) + 1);

function typeBadge(l: RawLogEntry): { label: string; class: string } {
  switch (l.kind) {
    case 'consume':
      return { label: '计费', class: 'bg-sky-500/10 text-sky-600 dark:text-sky-400' };
    case 'error':
      return { label: '错误', class: 'bg-red-500/10 text-red-600 dark:text-red-400' };
    default:
      return { label: l.typeLabel, class: 'bg-muted text-muted-foreground' };
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
        <div class="flex flex-1 items-center gap-2">
          <div class="relative flex-1">
            <Search class="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              :model-value="store.q"
              class="h-8 pl-8 text-xs"
              placeholder="搜索模型 / 令牌 / 用户…"
              @update:model-value="onSearchInput"
            />
          </div>
          <Button variant="outline" size="sm" class="h-8 shrink-0 text-xs" @click="store.search(true)">
            <RefreshCw class="size-3.5" /> 刷新
          </Button>
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
              <TableHead class="w-20 whitespace-nowrap text-right text-xs">额度</TableHead>
              <TableHead class="w-16 whitespace-nowrap text-xs">用户</TableHead>
              <TableHead class="max-w-56 text-xs">详情</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow
              v-for="l in store.entries"
              :key="l.id"
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
                {{ l.channelId != null ? `#${l.channelId}` : '—' }}
              </TableCell>
              <TableCell class="max-w-40 truncate text-xs font-medium">{{ l.model ?? '—' }}</TableCell>
              <TableCell class="whitespace-nowrap text-right text-xs tabular-nums">
                {{ l.kind === 'consume' ? formatNumber(l.promptTokens) : '—' }}
              </TableCell>
              <TableCell class="whitespace-nowrap text-right text-xs tabular-nums">
                {{ l.kind === 'consume' ? formatNumber(l.completionTokens) : '—' }}
              </TableCell>
              <TableCell class="whitespace-nowrap text-right text-xs font-medium tabular-nums">
                {{ l.kind === 'consume' ? formatNumber(l.quota) : '—' }}
              </TableCell>
              <TableCell class="text-xs tabular-nums text-muted-foreground">
                {{ l.username ?? '—' }}
              </TableCell>
              <TableCell class="max-w-56 truncate text-[11px] text-muted-foreground">{{ l.message }}</TableCell>
            </TableRow>
            <TableRow v-if="!store.loading && !store.entries.length">
              <TableCell colspan="9" class="py-12 text-center text-xs text-muted-foreground">暂无日志</TableCell>
            </TableRow>
          </TableBody>
        </Table>
        <div v-if="store.loading" class="flex flex-col gap-1 border-t border-border py-2">
          <Skeleton v-for="i in 8" :key="i" class="h-6 w-full" />
        </div>
      </div>

      <!-- 分页 -->
      <div class="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3">
        <div class="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span>每页</span>
          <Select
            :model-value="String(store.limit)"
            @update:model-value="(v: unknown) => store.setPageSize(Number(v))"
          >
            <SelectTrigger class="h-7 w-16 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="n in [20, 50, 100, 200]" :key="n" :value="String(n)">{{ n }}</SelectItem>
            </SelectContent>
          </Select>
          <span class="tabular-nums">共 {{ formatNumber(store.total) }} 条 · {{ totalPages }} 页</span>
        </div>

        <div class="flex items-center gap-1.5">
          <Button variant="outline" size="icon-xs" :disabled="currentPage <= 1" @click="store.goTo(1)">
            <ChevronsLeft class="size-3.5" />
          </Button>
          <Button variant="outline" size="icon-xs" :disabled="currentPage <= 1" @click="store.goTo(currentPage - 1)">
            <ChevronLeft class="size-3.5" />
          </Button>
          <span class="flex items-center gap-1 px-1 text-[11px] tabular-nums">
            <Input
              :model-value="String(currentPage)"
              type="number"
              min="1"
              :max="totalPages"
              class="h-7 w-14 text-center text-xs"
              @update:model-value="(v: unknown) => { const p = Math.min(Math.max(1, Number(v) || 1), totalPages); if (p !== currentPage) store.goTo(p); }"
            />
            / {{ totalPages }}
          </span>
          <Button variant="outline" size="icon-xs" :disabled="currentPage >= totalPages" @click="store.goTo(currentPage + 1)">
            <ChevronRight class="size-3.5" />
          </Button>
          <Button variant="outline" size="icon-xs" :disabled="currentPage >= totalPages" @click="store.goTo(totalPages)">
            <ChevronsRight class="size-3.5" />
          </Button>
        </div>
      </div>
    </Card>

    <LogDetailDrawer />
  </div>
</template>
