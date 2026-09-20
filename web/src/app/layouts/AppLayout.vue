<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import {
  Activity,
  AlertTriangle,
  Database,
  Layers,
  LayoutDashboard,
  LogOut,
  Moon,
  RefreshCw,
  Search,
  Sun,
} from '@lucide/vue'
import { Button } from '@/shared/ui/button'
import { Badge } from '@/shared/ui/badge'
import { CommandDialog, type CommandItem } from '@/shared/ui/command'
import { useSessionStore } from '@/features/auth'
import { useRealtimePulse, resetRealtimeConnection } from '@/shared/api/websocket'
import { triggerGlobalRefresh } from '@/shared/composables/useAutoRefresh'
import { useTheme } from '@/shared/composables/useTheme'
import { toast } from '@/shared/lib/toast'
import { cn } from '@/shared/lib/utils'

const router = useRouter()
const route = useRoute()
const session = useSessionStore()
const { isConnected } = useRealtimePulse()
const { isDark, toggleTheme, initTheme } = useTheme()

const commandOpen = ref(false)
const refreshing = ref(false)

const navItems = [
  { path: '/', label: '控制台大屏', icon: LayoutDashboard },
  { path: '/dimensions', label: '多维分析详情', icon: Layers },
  { path: '/risks', label: '实时风险预警', icon: AlertTriangle },
]

function isActive(path: string): boolean {
  return path === '/' ? route.path === '/' : route.path.startsWith(path)
}

function handleRefresh(): void {
  refreshing.value = true
  triggerGlobalRefresh()
  window.setTimeout(() => {
    refreshing.value = false
  }, 400)
}

async function handleLogout(): Promise<void> {
  resetRealtimeConnection()
  await session.logout()
  toast.info('已安全退出')
  await router.replace('/login')
}

function navigate(path: string): void {
  commandOpen.value = false
  void router.push(path)
}

const commandItems = computed<CommandItem[]>(() => [
  ...navItems.map((item) => ({
    id: `nav-${item.path}`,
    title: item.label,
    subtitle: item.path === '/' ? '全局核心指标、吞吐量、时序趋势与渠道状态' : undefined,
    category: '导航',
    icon: item.icon,
    action: () => navigate(item.path),
  })),
  {
    id: 'act-theme',
    title: isDark.value ? '切换为浅色模式' : '切换为深色模式',
    category: '系统',
    icon: isDark.value ? Sun : Moon,
    action: () => {
      commandOpen.value = false
      toggleTheme()
    },
  },
  {
    id: 'act-refresh',
    title: '强制刷新数据',
    category: '操作',
    icon: RefreshCw,
    action: () => {
      commandOpen.value = false
      handleRefresh()
    },
  },
  {
    id: 'act-logout',
    title: '退出登录',
    category: '操作',
    icon: LogOut,
    action: () => {
      commandOpen.value = false
      void handleLogout()
    },
  },
])

function handleGlobalKey(event: KeyboardEvent): void {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    commandOpen.value = !commandOpen.value
  }
}

onMounted(() => {
  initTheme()
  window.addEventListener('keydown', handleGlobalKey)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalKey)
})
</script>

<template>
  <div class="relative flex min-h-svh flex-col bg-background selection:bg-primary selection:text-primary-foreground">
    <header class="sticky top-0 z-40 w-full border-b border-border/40 bg-background/80 backdrop-blur-md">
      <div class="mx-auto flex h-14 w-full max-w-7xl items-center justify-between px-4 sm:h-16 sm:px-6 lg:px-8">
        <div class="flex items-center gap-6">
          <RouterLink to="/" class="flex items-center gap-2.5 text-base font-semibold tracking-tight">
            <span class="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-md shadow-primary/20">
              <Activity class="size-4.5" />
            </span>
            <span class="font-bold">New-Pro</span>
          </RouterLink>

          <nav class="hidden md:flex items-center gap-1">
            <Button
              v-for="item in navItems"
              :key="item.path"
              variant="ghost"
              size="sm"
              as-child
              class="h-9 px-3 text-sm cursor-pointer"
            >
              <RouterLink :to="item.path" :class="cn(isActive(item.path) && 'bg-accent text-accent-foreground font-medium')">
                <component :is="item.icon" class="size-4" />
                {{ item.label }}
              </RouterLink>
            </Button>
          </nav>
        </div>

        <div class="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            class="h-8 gap-1.5 text-xs text-muted-foreground px-2.5 hidden sm:flex cursor-pointer border-border/60"
            @click="commandOpen = true"
          >
            <Search class="size-3.5" />
            <span>快捷搜索</span>
            <kbd class="pointer-events-none inline-flex h-4 select-none items-center gap-1 rounded bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
              ⌘K
            </kbd>
          </Button>

          <Button
            variant="ghost"
            size="icon"
            class="size-8 cursor-pointer text-muted-foreground hover:text-foreground"
            :disabled="refreshing"
            title="刷新数据"
            @click="handleRefresh"
          >
            <RefreshCw class="size-4" :class="refreshing && 'animate-spin'" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            class="size-8 cursor-pointer text-muted-foreground hover:text-foreground"
            :title="isDark ? '切换为浅色模式' : '切换为深色模式'"
            @click="toggleTheme"
          >
            <Sun v-if="isDark" class="size-4 text-amber-500" />
            <Moon v-else class="size-4 text-slate-600" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            class="size-8 cursor-pointer text-muted-foreground hover:text-destructive"
            title="安全退出"
            @click="handleLogout"
          >
            <LogOut class="size-4" />
          </Button>
        </div>
      </div>

      <div class="flex md:hidden border-t border-border/40 px-2 py-1.5 justify-around bg-muted/20">
        <RouterLink
          v-for="item in navItems"
          :key="item.path"
          :to="item.path"
          class="flex items-center gap-1.5 text-xs py-1 px-3 rounded-md transition-colors"
          :class="isActive(item.path) ? 'bg-primary text-primary-foreground font-medium' : 'text-muted-foreground'"
        >
          <component :is="item.icon" class="size-3.5" />
          {{ item.label }}
        </RouterLink>
      </div>
    </header>

    <CommandDialog v-model:open="commandOpen" :items="commandItems" />

    <main class="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <RouterView v-slot="{ Component }">
        <Transition name="page-fade" mode="out-in">
          <component :is="Component" />
        </Transition>
      </RouterView>
    </main>

    <footer class="mt-auto border-t border-border/40 py-3 text-xs text-muted-foreground bg-muted/10">
      <div class="mx-auto flex w-full max-w-7xl flex-col sm:flex-row items-center justify-between gap-2.5 sm:gap-4 px-4 sm:px-6 lg:px-8">
        <div class="flex items-center gap-2">
          <span class="font-semibold text-foreground tracking-tight">New-Pro</span>
          <Badge variant="outline" class="h-4.5 px-1.5 text-[10px] font-mono">v{{ session.version }}</Badge>
          <span class="hidden sm:inline text-border">|</span>
          <span class="text-[11px] text-muted-foreground/80">高性能实时监控</span>
        </div>
        <div class="flex flex-wrap items-center justify-center gap-3 text-xs">
          <div class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border/60 bg-card/60 text-[11px] shadow-2xs">
            <span
              class="size-2 rounded-full transition-all shrink-0"
              :class="isConnected ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)] animate-pulse' : 'bg-amber-500'"
            />
            <span class="text-muted-foreground">WebSocket:</span>
            <span :class="isConnected ? 'text-emerald-600 dark:text-emerald-400 font-medium' : 'text-amber-500 font-medium'">
              {{ isConnected ? '已直连' : '连接中...' }}
            </span>
          </div>

          <div class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border/60 bg-card/60 text-[11px] shadow-2xs">
            <Database class="size-3 shrink-0" :class="session.dbConnected ? 'text-emerald-500' : 'text-destructive'" />
            <span class="text-muted-foreground">PostgreSQL:</span>
            <span :class="session.dbConnected ? 'text-emerald-600 dark:text-emerald-400 font-medium' : 'text-destructive font-medium'">
              {{ session.dbConnected ? '正常通信' : '连接异常' }}
            </span>
          </div>

        </div>
      </div>
    </footer>
  </div>
</template>
