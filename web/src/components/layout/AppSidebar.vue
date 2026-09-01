<script setup lang="ts">
import { Activity } from '@lucide/vue';
import { NAV_ITEMS } from '@/lib/constants';

defineEmits<{ navigate: [] }>();
</script>

<template>
  <div class="flex h-full flex-col gap-2 p-3">
    <div class="flex items-center gap-2.5 px-2 py-3">
      <div class="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <Activity class="size-4" />
      </div>
      <div class="leading-tight">
        <p class="text-sm font-semibold tracking-tight">New-Pro</p>
        <p class="text-[11px] text-muted-foreground">Log Analytics</p>
      </div>
    </div>

    <Separator class="my-1" />

    <nav class="flex flex-col gap-1">
      <RouterLink
        v-for="item in NAV_ITEMS"
        :key="item.to"
        :to="item.to"
        class="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        :class="$route.path === item.to ? 'bg-muted text-foreground' : ''"
        @click="$emit('navigate')"
      >
        <component :is="item.icon" class="size-4" />
        {{ item.title }}
      </RouterLink>
    </nav>

    <div class="mt-auto rounded-lg border border-dashed p-3 text-[11px] leading-relaxed text-muted-foreground">
      <p class="font-medium text-foreground">v0.1.0</p>
      <p>NewAPI 实时日志分析</p>
    </div>
  </div>
</template>
