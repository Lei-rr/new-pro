<script setup lang="ts">
import { computed } from 'vue';
import { ArrowDownRight, ArrowUpRight } from '@lucide/vue';
import { Icons } from '@/lib/icons';

const props = defineProps<{
  title: string;
  value: string;
  icon: keyof typeof Icons.ui;
  delta?: number | null;
  /** delta 为"越高越好"的指标时取 true */
  positiveIsGood?: boolean;
  hint?: string;
  loading?: boolean;
}>();

const showDelta = computed(() => props.delta !== null && props.delta !== undefined);
const isUp = computed(() => (props.delta ?? 0) >= 0);
const isGood = computed(() => (props.positiveIsGood ? isUp.value : !isUp.value));
</script>

<template>
  <Card class="gap-4 p-4">
    <div class="flex items-start justify-between">
      <div class="min-w-0">
        <p class="text-xs font-medium text-muted-foreground">{{ title }}</p>
        <Skeleton v-if="loading" class="mt-2 h-7 w-24" />
        <p v-else class="mt-1 truncate text-2xl font-semibold tabular-nums tracking-tight">{{ value }}</p>
        <p v-if="hint" class="mt-0.5 text-[11px] text-muted-foreground">{{ hint }}</p>
      </div>
      <div class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted">
        <component :is="Icons.ui[icon]" class="size-4 text-muted-foreground" />
      </div>
    </div>

    <div v-if="showDelta" class="flex items-center gap-1 text-[11px] font-medium">
      <span :class="isGood ? 'text-emerald-500' : 'text-red-500'" class="flex items-center gap-0.5">
        <ArrowUpRight v-if="isUp" class="size-3" />
        <ArrowDownRight v-else class="size-3" />
        {{ Math.abs((delta ?? 0) * 100).toFixed(1) }}%
      </span>
      <span class="text-muted-foreground">较上期</span>
    </div>
  </Card>
</template>
