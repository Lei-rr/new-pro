<script setup lang="ts">
import type { Component } from 'vue';

defineProps<{
  label: string;
  value: string;
  icon?: Component;
  tone?: 'default' | 'ok' | 'warn' | 'danger';
  sub?: string;
}>();

const toneTextMap: Record<string, string> = {
  default: 'text-slate-800 dark:text-slate-100',
  ok: 'text-emerald-600 dark:text-emerald-400',
  warn: 'text-amber-600 dark:text-amber-400',
  danger: 'text-rose-600 dark:text-rose-400',
};

const toneIconMap: Record<string, string> = {
  default: 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400',
  ok: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400',
  warn: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400',
  danger: 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400',
};
</script>

<template>
  <div
    class="group relative flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md dark:border-slate-800/80 dark:bg-[#111827] dark:hover:border-slate-700"
  >
    <div class="flex items-center justify-between">
      <span class="text-xs font-semibold text-slate-500 dark:text-slate-400">{{ label }}</span>
      <div
        v-if="icon"
        class="flex size-7 items-center justify-center rounded-lg transition-transform group-hover:scale-110"
        :class="toneIconMap[tone ?? 'default']"
      >
        <component :is="icon" class="size-3.5" />
      </div>
    </div>

    <div class="mt-2">
      <div class="text-xl font-bold tracking-tight tabular-nums leading-tight" :class="toneTextMap[tone ?? 'default']">
        {{ value }}
      </div>
      <div v-if="sub" class="mt-1 text-xs font-medium text-slate-400 dark:text-slate-500 truncate">
        {{ sub }}
      </div>
    </div>
  </div>
</template>
