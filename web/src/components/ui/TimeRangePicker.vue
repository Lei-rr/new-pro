<script setup lang="ts">
import { useTimeRangeStore, TIME_RANGE_PRESETS, type TimeRangePreset } from '@/stores/timeRange';

const tr = useTimeRangeStore();
</script>

<template>
  <div class="flex items-center rounded-xl border border-slate-200/80 bg-slate-100/80 p-0.5 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
    <button
      v-for="item in TIME_RANGE_PRESETS"
      :key="item.key"
      type="button"
      class="rounded-lg px-2.5 py-1 text-3xs font-semibold transition-all"
      :class="
        tr.preset === item.key
          ? 'bg-white text-blue-600 shadow-xs dark:bg-slate-800 dark:text-blue-400'
          : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
      "
      @click="tr.setPreset(item.key as TimeRangePreset)"
    >
      {{ item.label }}
    </button>
  </div>
</template>
