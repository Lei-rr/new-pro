<script setup lang="ts">
import { useLogsStore } from '@/stores/logs';
import { formatCost, formatNumber } from '@/lib/formatters';

const store = useLogsStore();
const l = () => store.selected;

const details = () => {
  const e = store.selected;
  if (!e) return [];
  return [
    { label: '请求 ID', value: e.requestId },
    { label: '模型', value: e.model },
    { label: '渠道', value: `#${e.channelId}` },
    { label: '用户', value: `#${e.userId}` },
    { label: '令牌', value: e.tokenName },
    { label: '分组', value: e.group },
    { label: '客户端 IP', value: e.ip ?? '—' },
    { label: 'IP 归属', value: e.ipLocation ?? '—' },
    { label: '请求路径', value: e.requestPath ?? '—' },
    { label: '计费来源', value: e.billingSource ?? '—' },
    { label: '计费模式', value: e.billingMode ?? '—' },
    { label: '流式状态', value: e.streamStatus ?? (e.isStream ? 'streaming' : '—') },
    { label: '模型倍率', value: e.modelRatio !== null ? String(e.modelRatio) : '—' },
    { label: '模型单价', value: e.modelPrice !== null ? String(e.modelPrice) : '—' },
    { label: '补全倍率', value: e.completionRatio !== null ? String(e.completionRatio) : '—' },
    { label: '分组倍率', value: e.groupRatio !== null ? String(e.groupRatio) : '—' },
    { label: '缓存倍率', value: e.cacheRatio !== null ? String(e.cacheRatio) : '—' },
    { label: '匹配档位', value: e.matchedTier ?? '—' },
  ];
};
</script>

<template>
  <Drawer :open="!!store.selected" @update:open="(v: unknown) => store.select(v ? store.selected : null)">
    <DrawerContent class="max-h-[90vh] overflow-y-auto">
      <DrawerHeader>
        <DrawerTitle class="text-sm font-semibold">请求详情</DrawerTitle>
        <DrawerDescription class="text-xs">
          <span v-if="store.selected" class="font-mono">{{ store.selected.requestId }}</span>
        </DrawerDescription>
      </DrawerHeader>

      <div v-if="store.selected" class="flex flex-col gap-4 px-4 pb-6">
        <!-- 核心指标 -->
        <div class="grid grid-cols-2 gap-2">
          <div class="rounded-lg border p-3">
            <p class="text-[11px] text-muted-foreground">Prompt</p>
            <p class="mt-0.5 text-sm font-semibold tabular-nums">{{ formatNumber(store.selected.promptTokens) }}</p>
          </div>
          <div class="rounded-lg border p-3">
            <p class="text-[11px] text-muted-foreground">Completion</p>
            <p class="mt-0.5 text-sm font-semibold tabular-nums">{{ formatNumber(store.selected.completionTokens) }}</p>
          </div>
          <div class="rounded-lg border p-3">
            <p class="text-[11px] text-muted-foreground">成本</p>
            <p class="mt-0.5 text-sm font-semibold tabular-nums">{{ formatCost(store.selected.cost) }}</p>
          </div>
          <div class="rounded-lg border p-3">
            <p class="text-[11px] text-muted-foreground">Quota</p>
            <p class="mt-0.5 text-sm font-semibold tabular-nums">{{ formatNumber(store.selected.quota) }}</p>
          </div>
        </div>

        <!-- 性能 -->
        <div class="grid grid-cols-2 gap-2">
          <div class="rounded-lg border p-3">
            <p class="text-[11px] text-muted-foreground">耗时</p>
            <p class="mt-0.5 text-sm font-semibold tabular-nums">{{ store.selected.useTime }}s</p>
          </div>
          <div class="rounded-lg border p-3">
            <p class="text-[11px] text-muted-foreground">FRT</p>
            <p class="mt-0.5 text-sm font-semibold tabular-nums">
              {{ store.selected.frt !== null ? `${store.selected.frt}ms` : '—' }}
            </p>
          </div>
        </div>

        <!-- 明细字段 -->
        <div class="rounded-lg border">
          <div v-for="(d, i) in details()" :key="d.label" class="flex gap-3 px-3 py-2 text-xs" :class="i !== 0 ? 'border-t border-border/60' : ''">
            <span class="w-24 shrink-0 text-muted-foreground">{{ d.label }}</span>
            <span class="min-w-0 flex-1 break-all font-mono text-[11px]">{{ d.value }}</span>
          </div>
        </div>
      </div>

      <DrawerFooter>
        <Button variant="outline" size="sm" class="w-full" @click="store.select(null)">关闭</Button>
      </DrawerFooter>
    </DrawerContent>
  </Drawer>
</template>
