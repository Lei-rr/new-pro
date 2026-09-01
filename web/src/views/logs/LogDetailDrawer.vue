<script setup lang="ts">
import { useLogsStore } from '@/stores/logs';
import { formatCost, formatDateTime, formatNumber } from '@/lib/formatters';

const store = useLogsStore();

const details = () => {
  const e = store.selected;
  if (!e) return [];
  const items: Array<{ label: string; value: string }> = [
    { label: '时间', value: formatDateTime(e.timestamp) },
    { label: '请求 ID', value: e.requestId || '—' },
    { label: '模型', value: e.model ?? '—' },
    { label: '渠道', value: e.channelId != null ? `#${e.channelId}` : '—' },
    { label: '渠道名', value: e.channelName ?? '—' },
    { label: '用户', value: e.username ?? '—' },
    { label: '令牌', value: e.tokenName ?? '—' },
    { label: '分组', value: e.group ?? '—' },
    { label: '流式', value: e.isStream ? '是' : '否' },
    { label: 'IP', value: e.ip ?? '—' },
  ];
  if (e.kind === 'consume') {
    items.push(
      { label: '提示Tokens', value: formatNumber(e.promptTokens) },
      { label: '补全Tokens', value: formatNumber(e.completionTokens) },
      { label: 'Quota', value: formatNumber(e.quota) },
      { label: '成本', value: formatCost(e.quota / 500000) },
    );
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
        <DrawerDescription class="text-xs font-mono">{{ store.selected?.requestId }}</DrawerDescription>
      </DrawerHeader>

      <div v-if="store.selected" class="flex flex-col gap-4 px-4 pb-6">
        <div class="rounded-lg border bg-muted/40 p-3">
          <p class="break-all font-mono text-xs leading-relaxed">{{ store.selected.message }}</p>
        </div>

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
