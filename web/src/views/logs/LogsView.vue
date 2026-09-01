<script setup lang="ts">
import { computed, onMounted, watch } from 'vue';
import { ChevronLeft, ChevronRight, Search, X } from '@lucide/vue';
import { useLogsStore } from '@/stores/logs';
import { useAppStore } from '@/stores/app';
import { formatCost, formatNumber, formatTime } from '@/lib/formatters';
import LogDetailDrawer from './LogDetailDrawer.vue';

const store = useLogsStore();
const app = useAppStore();

onMounted(async () => {
  await Promise.all([store.loadFacets(), store.search()]);
});

watch(() => app.rangeHours, () => store.search(true));

const totalPages = computed(() => Math.max(1, Math.ceil(store.total / store.limit)));
const currentPage = computed(() => Math.floor(store.offset / store.limit) + 1);

const hasActiveFilters = computed(() =>
  Object.values(store.filters).some((v) => v !== undefined && v !== ''),
);

function applyFilters(): void {
  void store.search(true);
}

function resetFilters(): void {
  store.clearFilters();
  void store.search(true);
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <!-- 筛选栏 -->
    <Card class="gap-3 p-3 sm:p-4">
      <div class="flex flex-col gap-2 lg:flex-row lg:items-center">
        <div class="relative flex-1">
          <Search class="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            :model-value="store.filters.q ?? ''"
            class="h-8 pl-8 text-xs"
            placeholder="搜索模型 / 令牌 / 分组…"
            @update:model-value="store.setFilter('q', $event)"
            @keyup.enter="applyFilters"
          />
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <Select
            :model-value="store.filters.model"
            @update:model-value="(v: unknown) => { store.setFilter('model', v === 'all' || v == null ? undefined : String(v)); }"
          >
            <SelectTrigger class="h-8 w-40 text-xs">
              <SelectValue placeholder="全部模型" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部模型</SelectItem>
              <SelectItem v-for="m in store.facets?.models ?? []" :key="m.key" :value="m.key">
                {{ m.key }} ({{ formatNumber(m.requests) }})
              </SelectItem>
            </SelectContent>
          </Select>

          <Select
            :model-value="store.filters.channel"
            @update:model-value="(v: unknown) => { store.setFilter('channel', v === 'all' || v == null ? undefined : String(v)); }"
          >
            <SelectTrigger class="h-8 w-32 text-xs">
              <SelectValue placeholder="全部渠道" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部渠道</SelectItem>
              <SelectItem v-for="c in store.facets?.channels ?? []" :key="c.key" :value="c.key">
                #{{ c.key }}
              </SelectItem>
            </SelectContent>
          </Select>

          <Select
            :model-value="store.filters.user"
            @update:model-value="(v: unknown) => { store.setFilter('user', v === 'all' || v == null ? undefined : String(v)); }"
          >
            <SelectTrigger class="h-8 w-28 text-xs">
              <SelectValue placeholder="全部用户" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部用户</SelectItem>
              <SelectItem v-for="u in store.facets?.users ?? []" :key="u.key" :value="u.key">
                #{{ u.key }}
              </SelectItem>
            </SelectContent>
          </Select>

          <Button size="sm" class="h-8 text-xs" @click="applyFilters">查询</Button>
          <Button v-if="hasActiveFilters" variant="ghost" size="sm" class="h-8 text-xs" @click="resetFilters">
            <X class="size-3.5" /> 清除
          </Button>
        </div>
      </div>
    </Card>

    <!-- 数据区 -->
    <Card class="p-0">
      <div class="flex items-center justify-between border-b border-border px-4 py-3">
        <p class="text-xs text-muted-foreground">
          共 <span class="font-medium text-foreground tabular-nums">{{ formatNumber(store.total) }}</span> 条记录
        </p>
      </div>

      <!-- 桌面表格 -->
      <div class="hidden overflow-x-auto lg:block">
        <Table>
          <TableHeader>
            <TableRow class="hover:bg-transparent">
              <TableHead class="w-24 text-xs">时间</TableHead>
              <TableHead class="text-xs">模型</TableHead>
              <TableHead class="w-16 text-xs">渠道</TableHead>
              <TableHead class="w-16 text-xs">用户</TableHead>
              <TableHead class="w-28 text-xs">IP / 归属</TableHead>
              <TableHead class="w-24 text-right text-xs">Tokens</TableHead>
              <TableHead class="w-20 text-right text-xs">成本</TableHead>
              <TableHead class="w-16 text-center text-xs">流式</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="l in store.entries" :key="l.requestId" class="cursor-pointer" @click="store.select(l)">
              <TableCell class="font-mono text-[11px] text-muted-foreground">{{ formatTime(l.timestamp) }}</TableCell>
              <TableCell class="max-w-40 truncate text-xs font-medium">{{ l.model }}</TableCell>
              <TableCell class="text-xs tabular-nums">#{{ l.channelId }}</TableCell>
              <TableCell class="text-xs tabular-nums">#{{ l.userId }}</TableCell>
              <TableCell class="text-[11px]">
                <span class="font-mono">{{ l.ip ?? '—' }}</span>
                <span v-if="l.ipLocation" class="block truncate text-muted-foreground">{{ l.ipLocation }}</span>
              </TableCell>
              <TableCell class="text-right text-xs tabular-nums">
                {{ formatNumber(l.promptTokens + l.completionTokens) }}
              </TableCell>
              <TableCell class="text-right text-xs font-medium tabular-nums">{{ formatCost(l.cost) }}</TableCell>
              <TableCell class="text-center">
                <Badge :variant="l.isStream ? 'secondary' : 'outline'" class="text-[10px]">
                  {{ l.isStream ? '流式' : '普通' }}
                </Badge>
              </TableCell>
            </TableRow>
            <TableRow v-if="!store.loading && !store.entries.length">
              <TableCell colspan="8" class="py-10 text-center text-xs text-muted-foreground">暂无匹配记录</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      <!-- 移动卡片 -->
      <div class="flex flex-col divide-y divide-border lg:hidden">
        <button
          v-for="l in store.entries"
          :key="l.requestId"
          class="flex flex-col gap-1 px-4 py-3 text-left active:bg-muted"
          @click="store.select(l)"
        >
          <div class="flex items-center justify-between gap-2">
            <span class="truncate text-xs font-medium">{{ l.model }}</span>
            <span class="text-xs font-medium tabular-nums">{{ formatCost(l.cost) }}</span>
          </div>
          <div class="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span class="font-mono">{{ formatTime(l.timestamp) }}</span>
            <span>#{{ l.channelId }}</span>
            <span>#{{ l.userId }}</span>
            <span class="ml-auto tabular-nums">{{ formatNumber(l.promptTokens + l.completionTokens) }} tok</span>
          </div>
        </button>
        <div v-if="!store.loading && !store.entries.length" class="py-10 text-center text-xs text-muted-foreground">
          暂无匹配记录
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
