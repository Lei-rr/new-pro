<script setup lang="ts">
import { useLogsStore } from '@/stores/logs';
import { formatCost, formatDateTime, formatNumber } from '@/lib/formatters';

const store = useLogsStore();

const details = () => {
  const e = store.selected;
  if (!e) return [];
  const d = e.detail as Record<string, unknown> | null;
  if (!d) {
    return [
      { label: '时间', value: formatDateTime(e.timestamp) },
      { label: '请求 ID', value: e.requestId ?? '—' },
      { label: '来源文件', value: e.sourceFile },
    ];
  }
  const items: Array<{ label: string; value: string }> = [
    { label: '时间', value: formatDateTime(e.timestamp) },
    { label: '请求 ID', value: e.requestId ?? '—' },
  ];
  for (const [k, v] of Object.entries(d)) {
    if (v === null || v === undefined) continue;
    if (k === 'ipLocation') continue;
    items.push({ label: k, value: typeof v === 'object' ? JSON.stringify(v) : String(v) });
  }
  return items;
};
</script>

<template>
  <Drawer :open="!!store.selected" @update:open="(v: unknown) => store.select(v ? store.selected : null)">
    <DrawerContent class="max-h-[90vh] overflow-y-auto">
      <DrawerHeader>
        <DrawerTitle class="text-sm font-semibold">
          {{ store.selected?.kind === 'consume' ? '计费记录详情' : '日志详情' }}
        </DrawerTitle>
        <DrawerDescription class="text-xs font-mono">
          {{ store.selected?.requestId ?? store.selected?.sourceFile }}
        </DrawerDescription>
      </DrawerHeader>

      <div v-if="store.selected" class="flex flex-col gap-4 px-4 pb-6">
        <div class="rounded-lg border bg-muted/40 p-3">
          <p class="break-all font-mono text-xs leading-relaxed">{{ store.selected.message }}</p>
        </div>

        <!-- consume 核心指标 -->
        <div v-if="store.selected.kind === 'consume' && store.selected.detail" class="grid grid-cols-2 gap-2">
          <div class="rounded-lg border p-3">
            <p class="text-[11px] text-muted-foreground">成本</p>
            <p class="mt-0.5 text-sm font-semibold tabular-nums">{{ formatCost(store.selected.detail.cost as number) }}</p>
          </div>
          <div class="rounded-lg border p-3">
            <p class="text-[11px] text-muted-foreground">Tokens</p>
            <p class="mt-0.5 text-sm font-semibold tabular-nums">
              {{ formatNumber((store.selected.detail.promptTokens as number) + (store.selected.detail.completionTokens as number)) }}
            </p>
          </div>
        </div>

        <!-- 全字段明细 -->
        <div class="rounded-lg border">
          <div
            v-for="(d, i) in details()"
            :key="d.label"
            class="flex gap-3 px-3 py-2 text-xs"
            :class="i !== 0 ? 'border-t border-border/60' : ''"
          >
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
