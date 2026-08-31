<script setup lang="ts">
import { Inbox } from 'lucide-vue-next';

defineProps<{ text?: string }>();
</script>

<template>
  <div class="flex flex-col items-center justify-center gap-2 py-12 text-slate-400 dark:text-slate-500">
    <Inbox class="size-8" />
    <span class="text-sm">{{ text ?? '暂无数据' }}</span>
  </div>
</template>
