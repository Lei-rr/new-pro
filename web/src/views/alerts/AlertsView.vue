<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { CircleAlert, Info, TriangleAlert } from '@lucide/vue';
import { useAlertsStore } from '@/stores/alerts';
import { formatDateTime } from '@/lib/formatters';
import type { AlertSeverity } from '@/api/types';

const store = useAlertsStore();

onMounted(() => store.load());

const SEVERITY_META: Record<AlertSeverity, { label: string; icon: typeof Info; class: string }> = {
  critical: { label: '严重', icon: TriangleAlert, class: 'border-red-500/30 bg-red-500/5 text-red-600 dark:text-red-400' },
  warning: { label: '警告', icon: CircleAlert, class: 'border-amber-500/30 bg-amber-500/5 text-amber-600 dark:text-amber-400' },
  info: { label: '提示', icon: Info, class: 'border-sky-500/30 bg-sky-500/5 text-sky-600 dark:text-sky-400' },
};

const counts = computed(() => {
  const c = { critical: 0, warning: 0, info: 0 };
  for (const a of store.alerts) c[a.severity]++;
  return c;
});
</script>

<template>
  <div class="flex flex-col gap-4">
    <!-- 严重度筛选 -->
    <div class="flex items-center gap-1.5">
      <Button
        variant="outline"
        size="sm"
        class="text-xs"
        :class="store.severity === 'all' ? 'border-primary text-foreground' : ''"
        @click="store.setSeverity('all')"
      >
        全部 ({{ store.alerts.length }})
      </Button>
      <Button
        v-for="(meta, sev) in SEVERITY_META"
        :key="sev"
        variant="outline"
        size="sm"
        class="text-xs"
        :class="store.severity === sev ? 'border-primary text-foreground' : ''"
        @click="store.setSeverity(sev as AlertSeverity)"
      >
        {{ meta.label }} ({{ counts[sev as AlertSeverity] }})
      </Button>
    </div>

    <!-- 告警列表 -->
    <div v-if="store.loading" class="flex flex-col gap-3">
      <Skeleton v-for="i in 4" :key="i" class="h-20 w-full" />
    </div>

    <div v-else class="flex flex-col gap-3">
      <Card
        v-for="a in store.alerts"
        :key="a.id"
        class="gap-3 p-4"
        :class="SEVERITY_META[a.severity].class"
      >
        <div class="flex items-start gap-3">
          <component :is="SEVERITY_META[a.severity].icon" class="mt-0.5 size-4 shrink-0" />
          <div class="min-w-0 flex-1">
            <div class="flex items-center justify-between gap-2">
              <Badge variant="outline" class="text-[10px]">{{ SEVERITY_META[a.severity].label }}</Badge>
              <span class="text-[11px] text-muted-foreground">{{ formatDateTime(a.timestamp) }}</span>
            </div>
            <p class="mt-2 text-xs leading-relaxed">{{ a.message }}</p>
            <p class="mt-1 text-[10px] text-muted-foreground">规则 {{ a.ruleId }} · {{ a.id }}</p>
          </div>
        </div>
      </Card>

      <div v-if="!store.alerts.length" class="rounded-xl border border-dashed p-10 text-center text-xs text-muted-foreground">
        当前筛选下暂无告警
      </div>
    </div>
  </div>
</template>
