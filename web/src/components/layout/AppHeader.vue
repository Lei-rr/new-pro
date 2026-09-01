<script setup lang="ts">
import { Menu, Moon, Sun, Wifi, WifiOff } from '@lucide/vue';
import { useAppStore } from '@/stores/app';
import { useRealtimeStore } from '@/stores/realtime';
import { TIME_RANGES } from '@/lib/constants';
import { useMediaQuery } from '@vueuse/core';

const app = useAppStore();
const realtime = useRealtimeStore();
const isDesktop = useMediaQuery('(min-width: 1024px)');

function onRangeChange(value: string): void {
  app.setRange(Number(value));
}
</script>

<template>
  <header class="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4 sm:px-6">
    <Button v-if="!isDesktop" variant="ghost" size="icon" @click="app.mobileNavOpen = true">
      <Menu class="size-4" />
    </Button>

    <div class="min-w-0 flex-1">
      <h1 class="truncate text-sm font-semibold">{{ $route.meta.title ?? '控制台' }}</h1>
    </div>

    <!-- WS 状态 -->
    <Tooltip :content="realtime.connected ? '实时连接正常' : '实时连接断开，重连中'">
      <span
        class="flex size-6 items-center justify-center rounded-md"
        :class="realtime.connected ? 'text-emerald-500' : 'text-muted-foreground'"
      >
        <Wifi v-if="realtime.connected" class="size-4" />
        <WifiOff v-else class="size-4" />
      </span>
    </Tooltip>

    <!-- 全局时间范围 -->
    <Select :model-value="String(app.rangeHours)" @update:model-value="onRangeChange">
      <SelectTrigger class="h-8 w-28 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem v-for="r in TIME_RANGES" :key="r.hours" :value="String(r.hours)">
          {{ r.label }}
        </SelectItem>
      </SelectContent>
    </Select>

    <!-- 主题切换 -->
    <Button variant="ghost" size="icon" @click="app.toggleTheme()">
      <Sun v-if="app.isDark" class="size-4" />
      <Moon v-else class="size-4" />
    </Button>
  </header>
</template>
