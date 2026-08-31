<script setup lang="ts">
import type { AlertSeverity } from '@/api/types';

defineProps<{ severity: AlertSeverity }>();

const badgeStyles: Record<AlertSeverity, { bg: string; dot: string; label: string }> = {
  critical: {
    bg: 'bg-rose-50 text-rose-700 border-rose-200/80 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/30',
    dot: 'bg-rose-500',
    label: '严重',
  },
  warning: {
    bg: 'bg-amber-50 text-amber-700 border-amber-200/80 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/30',
    dot: 'bg-amber-500',
    label: '警告',
  },
  info: {
    bg: 'bg-sky-50 text-sky-700 border-sky-200/80 dark:bg-sky-500/10 dark:text-sky-400 dark:border-sky-500/30',
    dot: 'bg-sky-500',
    label: '提示',
  },
};
</script>

<template>
  <span
    class="inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-semibold shadow-2xs"
    :class="badgeStyles[severity]?.bg ?? badgeStyles.info.bg"
  >
    <span class="size-1.5 rounded-full" :class="badgeStyles[severity]?.dot ?? badgeStyles.info.dot" />
    <span>{{ badgeStyles[severity]?.label ?? '提示' }}</span>
  </span>
</template>
