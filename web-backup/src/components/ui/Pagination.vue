<script setup lang="ts">
import { computed } from 'vue';
import { ChevronLeft, ChevronRight } from 'lucide-vue-next';

const props = defineProps<{
  page: number;
  pageSize: number;
  total: number;
}>();

const emit = defineEmits<{
  (e: 'update:page', val: number): void;
}>();

const totalPages = computed(() => Math.max(1, Math.ceil(props.total / props.pageSize)));

function prev(): void {
  if (props.page > 1) emit('update:page', props.page - 1);
}

function next(): void {
  if (props.page < totalPages.value) emit('update:page', props.page + 1);
}
</script>

<template>
  <div class="flex items-center justify-between border-t border-slate-100/80 px-4 py-3 text-xs text-slate-500 dark:border-slate-800/80 dark:text-slate-400">
    <div class="flex items-center gap-1.5">
      <span>共</span>
      <span class="font-semibold tabular-nums text-slate-800 dark:text-slate-200">{{ total.toLocaleString() }}</span>
      <span>条记录 · 每页 {{ pageSize }} 条</span>
    </div>

    <div class="flex items-center gap-2">
      <button
        type="button"
        :disabled="page <= 1"
        class="flex size-7.5 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-2xs transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:disabled:hover:bg-slate-800"
        @click="prev"
      >
        <ChevronLeft class="size-4" />
      </button>

      <span class="px-2 font-medium tabular-nums text-slate-700 dark:text-slate-300">
        {{ page }} / {{ totalPages }}
      </span>

      <button
        type="button"
        :disabled="page >= totalPages"
        class="flex size-7.5 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-2xs transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:disabled:hover:bg-slate-800"
        @click="next"
      >
        <ChevronRight class="size-4" />
      </button>
    </div>
  </div>
</template>
