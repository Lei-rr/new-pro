<script setup lang="ts">
defineProps<{
  title: string;
  loading?: boolean;
}>();
</script>

<template>
  <div
    class="flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs transition-colors dark:border-slate-800/80 dark:bg-[#111827]"
  >
    <div class="mb-3 flex items-center justify-between">
      <h2 class="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
        {{ title }}
      </h2>
      <slot name="extra" />
    </div>

    <div v-if="loading" class="flex h-72 items-center justify-center">
      <div class="flex flex-col items-center gap-2 text-slate-400">
        <div class="size-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
        <span class="text-xs font-medium">加载图表中…</span>
      </div>
    </div>
    <div v-else class="flex-1">
      <slot />
    </div>
  </div>
</template>
