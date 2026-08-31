<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import {
  Activity,
  BarChart3,
  Bell,
  LayoutDashboard,
  Moon,
  ScrollText,
  Sun,
  Wifi,
  WifiOff,
  Zap,
} from 'lucide-vue-next';
import { useAppStore } from '@/stores/app';
import { useWsStore } from '@/stores/ws';
import TimeRangePicker from '@/components/ui/TimeRangePicker.vue';

const route = useRoute();
const app = useAppStore();
const ws = useWsStore();

const nav = [
  { to: '/overview', label: '总览看板', icon: LayoutDashboard },
  { to: '/dimensions', label: '多维分析', icon: BarChart3 },
  { to: '/logs', label: '日志检索', icon: ScrollText },
  { to: '/alerts', label: '系统告警', icon: Bell },
];

const wsStatusMeta = () => {
  switch (ws.status) {
    case 'open':
      return { text: '实时流已连接', color: 'bg-emerald-500', bg: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400 border-emerald-200/60 dark:border-emerald-500/20' };
    case 'connecting':
      return { text: '正在连接…', color: 'bg-amber-500 animate-pulse', bg: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400 border-amber-200/60 dark:border-amber-500/20' };
    default:
      return { text: '实时流断开', color: 'bg-slate-400', bg: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 border-slate-200 dark:border-slate-700' };
  }
};

onMounted(() => ws.connect());
onBeforeUnmount(() => ws.disconnect());
</script>

<template>
  <div class="flex h-full overflow-hidden">
    <!-- 侧边导航栏 -->
    <aside
      class="flex w-16 shrink-0 flex-col items-center border-r border-slate-200/80 bg-white py-4.5 transition-colors dark:border-slate-800/80 dark:bg-[#0e1424] md:w-56"
    >
      <!-- Logo 区域 -->
      <div class="mb-6 flex w-full items-center justify-center gap-2.5 px-3.5 md:justify-start">
        <div class="flex size-8.5 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 shadow-xs shadow-blue-500/25 text-white">
          <Zap class="size-5" />
        </div>
        <div class="hidden flex-col md:flex">
          <span class="text-base font-bold tracking-tight text-slate-800 dark:text-slate-100 leading-tight">
            NewAPI
          </span>
          <span class="text-xs font-semibold text-slate-400 dark:text-slate-500 tracking-wider uppercase">
            Analytics
          </span>
        </div>
      </div>

      <!-- 导航 Links (统一标准 text-sm 14px) -->
      <nav class="flex w-full flex-col gap-1.5 px-2.5">
        <RouterLink
          v-for="item in nav"
          :key="item.to"
          :to="item.to"
          class="group relative flex w-full items-center justify-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all md:justify-start"
          :class="
            route.path.startsWith(item.to)
              ? 'bg-blue-50/90 text-blue-600 shadow-2xs dark:bg-blue-500/15 dark:text-blue-400 font-semibold'
              : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/70 dark:hover:text-slate-200'
          "
        >
          <!-- Active 指示条 -->
          <div
            v-if="route.path.startsWith(item.to)"
            class="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-blue-500"
          />

          <component
            :is="item.icon"
            class="size-4.5 shrink-0 transition-transform group-hover:scale-105"
            :class="route.path.startsWith(item.to) ? 'text-blue-500 dark:text-blue-400' : 'text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300'"
          />
          <span class="hidden md:inline">{{ item.label }}</span>
        </RouterLink>
      </nav>

      <div class="flex-1" />

      <!-- 侧边栏底部仅保留极简切换图标按钮 -->
      <div class="flex w-full justify-center px-2.5 md:justify-start">
        <button
          type="button"
          class="flex size-9 items-center justify-center rounded-xl border border-slate-200/80 bg-slate-50 text-slate-600 shadow-2xs transition-all hover:bg-slate-100 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
          :title="app.theme === 'dark' ? '切换浅色主题' : '切换暗色主题'"
          @click="app.toggleTheme()"
        >
          <Sun v-if="app.theme === 'dark'" class="size-4.5 text-amber-400" />
          <Moon v-else class="size-4.5 text-indigo-500" />
        </button>
      </div>
    </aside>

    <!-- 主工作区 -->
    <div class="flex min-w-0 flex-1 flex-col overflow-hidden bg-slate-50/60 dark:bg-[#0b0f19]">
      <!-- 顶栏 Header -->
      <header
        class="flex h-14 shrink-0 items-center justify-between border-b border-slate-200/80 bg-white/80 px-4 backdrop-blur-md transition-colors dark:border-slate-800/80 dark:bg-[#0e1424]/80 md:px-6"
      >
        <div class="flex items-center gap-3">
          <h1 class="text-base font-bold text-slate-800 dark:text-slate-100">
            {{ route.meta.title ?? '看板' }}
          </h1>
        </div>

        <div class="flex items-center gap-2.5">
          <!-- 全局时间维度选择器 -->
          <TimeRangePicker />

          <!-- WebSocket 连接状态 -->
          <div
            class="flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium shadow-2xs"
            :class="wsStatusMeta().bg"
          >
            <span class="size-1.5 rounded-full" :class="wsStatusMeta().color" />
            <span class="hidden sm:inline">{{ wsStatusMeta().text }}</span>
          </div>

          <!-- 顶栏快捷主题切换图标按钮 -->
          <button
            type="button"
            class="flex size-8 items-center justify-center rounded-lg border border-slate-200/80 bg-white text-slate-600 shadow-2xs transition-all hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            :title="app.theme === 'dark' ? '切换浅色主题' : '切换暗色主题'"
            @click="app.toggleTheme()"
          >
            <Sun v-if="app.theme === 'dark'" class="size-4 text-amber-400" />
            <Moon v-else class="size-4 text-indigo-500" />
          </button>
        </div>
      </header>

      <!-- 主内容区域 -->
      <main class="flex-1 overflow-auto p-4 md:p-6">
        <div class="mx-auto max-w-7xl">
          <slot />
        </div>
      </main>
    </div>
  </div>
</template>
