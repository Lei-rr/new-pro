<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import {
  LayoutDashboard,
  Layers,
  AlertTriangle,
  Sun,
  Moon,
  LogOut,
  RefreshCw,
  Activity,
  Database,
  Search,
} from '@lucide/vue'
import { Button } from '@/shared/ui/button'
import { Badge } from '@/shared/ui/badge'
import { AppTooltip } from '@/shared/ui/tooltip'
import { CommandDialog, type CommandItem } from '@/shared/ui/command'
import { useSessionStore } from '@/features/auth'
import { http } from '@/shared/api/http'
import { useRealtimePulse } from '@/shared/api/websocket'
import { toast } from '@/shared/lib/toast'
import { cn, formatTokens } from '@/shared/lib/utils'

const router = useRouter()
const route = useRoute()
const session = useSessionStore()
const { pulse: wsPulse, isConnected: wsConnected } = useRealtimePulse()

const isDark = ref(false)
const commandOpen = ref(false)
const isRefreshing = ref(false)

// 实时心跳吞吐条状态
const pulse = computed(() => {
  if (wsPulse.value) {
    return {
      qps: wsPulse.value.qps,
      rpm: wsPulse.value.rpm,
      tpm: wsPulse.value.tpm,
      last1mRequests: wsPulse.value.last1mRequests,
      avgLatency1m: wsPulse.value.avgLatency1m,
      successRate1m: wsPulse.value.successRate1m,
      dbConnected: true,
      wsConnected: wsConnected.value,
    }
  }
  return {
    qps: 0,
    rpm: 0,
    tpm: 0,
    last1mRequests: 0,
    avgLatency1m: 0,
    successRate1m: 100,
    dbConnected: true,
    wsConnected: wsConnected.value,
  }
})

function initTheme() {
  const saved = localStorage.getItem('theme')
  if (saved === 'dark') {
    document.documentElement.classList.add('dark')
    isDark.value = true
  } else {
    document.documentElement.classList.remove('dark')
    isDark.value = false
  }
}

function toggleDark() {
  const dark = document.documentElement.classList.toggle('dark')
  isDark.value = dark
  localStorage.setItem('theme', dark ? 'dark' : 'light')
}

async function handleRefresh() {
  isRefreshing.value = true
  window.dispatchEvent(new CustomEvent('new-pro:refresh'))
  setTimeout(() => {
    isRefreshing.value = false
  }, 400)
}

async function handleLogout() {
  await session.logout()
  toast.info('已安全退出')
  router.replace('/login')
}

function isActive(path: string) {
  if (path === '/') return route.path === '/'
  return route.path.startsWith(path)
}

const commandItems = computed<CommandItem[]>(() => [
  {
    id: 'nav-overview',
    title: '控制台大屏',
    subtitle: '全局核心指标、吞吐量、时序趋势与渠道状态',
    category: '导航',
    icon: LayoutDashboard,
    action: () => {
      commandOpen.value = false
      router.push('/')
    },
  },
  {
    id: 'nav-dimensions',
    title: '多维分析详情',
    subtitle: '按分组、用户、渠道、IP、模型进行深度钻取分析',
    category: '导航',
    icon: Layers,
    action: () => {
      commandOpen.value = false
      router.push('/dimensions')
    },
  },
  {
    id: 'nav-risks',
    title: '实时风险预警',
    subtitle: '高危IP封禁建议、失败率尖峰、异常高额消耗告警',
    category: '导航',
    icon: AlertTriangle,
    action: () => {
      commandOpen.value = false
      router.push('/risks')
    },
  },
  {
    id: 'act-theme',
    title: isDark.value ? '切换为浅色模式' : '切换为深色模式',
    category: '系统',
    icon: isDark.value ? Sun : Moon,
    action: () => {
      commandOpen.value = false
      toggleDark()
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
      handleLogout()
    },
  },
])

function handleGlobalKey(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault()
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
    <!-- 顶部主导航栏 -->
    <header class="sticky top-0 z-40 w-full border-b border-border/40 bg-background/80 backdrop-blur-md">
      <div class="mx-auto flex h-14 w-full max-w-7xl items-center justify-between px-4 sm:h-16 sm:px-6 lg:px-8">
        <!-- Logo 与核心导航 -->
        <div class="flex items-center gap-6">
          <RouterLink to="/" class="flex items-center gap-2.5 text-base font-semibold tracking-tight">
            <span class="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-md shadow-primary/20">
              <Activity class="size-4.5" />
            </span>
            <span class="font-bold">New-Pro</span>
          </RouterLink>

          <!-- 三个主业务页面切换链接 -->
          <nav class="hidden md:flex items-center gap-1">
            <Button variant="ghost" size="sm" as-child class="h-9 px-3 text-sm cursor-pointer">
              <RouterLink to="/" :class="cn(isActive('/') && 'bg-accent text-accent-foreground font-medium')">
                <LayoutDashboard class="size-4" />
                控制台大屏
              </RouterLink>
            </Button>

            <Button variant="ghost" size="sm" as-child class="h-9 px-3 text-sm cursor-pointer">
              <RouterLink to="/dimensions" :class="cn(isActive('/dimensions') && 'bg-accent text-accent-foreground font-medium')">
                <Layers class="size-4" />
                多维分析详情
              </RouterLink>
            </Button>

            <Button variant="ghost" size="sm" as-child class="h-9 px-3 text-sm cursor-pointer">
              <RouterLink to="/risks" :class="cn(isActive('/risks') && 'bg-accent text-accent-foreground font-medium')">
                <AlertTriangle class="size-4" />
                实时风险预警
              </RouterLink>
            </Button>
          </nav>
        </div>

        <!-- 顶部操作区 -->
        <div class="flex items-center gap-3">
          <!-- ⌘K 快捷搜寻 -->
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

          <!-- 刷新按钮 -->
          <Button
            variant="ghost"
            size="icon"
            class="size-8 cursor-pointer text-muted-foreground hover:text-foreground"
            :disabled="isRefreshing"
            title="刷新数据"
            @click="handleRefresh"
          >
            <RefreshCw class="size-4" :class="isRefreshing && 'animate-spin'" />
          </Button>

          <!-- 主题切换 (浅色 / 深色) -->
          <Button
            variant="ghost"
            size="icon"
            class="size-8 cursor-pointer text-muted-foreground hover:text-foreground"
            :title="isDark ? '切换为浅色模式' : '切换为深色模式'"
            @click="toggleDark"
          >
            <Sun v-if="isDark" class="size-4 text-amber-500" />
            <Moon v-else class="size-4 text-slate-600" />
          </Button>

          <!-- 退出登录 -->
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

      <!-- 移动端底栏导航条 -->
      <div class="flex md:hidden border-t border-border/40 px-2 py-1.5 justify-around bg-muted/20">
        <RouterLink
          to="/"
          class="flex items-center gap-1.5 text-xs py-1 px-3 rounded-md transition-colors"
          :class="isActive('/') ? 'bg-primary text-primary-foreground font-medium' : 'text-muted-foreground'"
        >
          <LayoutDashboard class="size-3.5" />
          控制台
        </RouterLink>
        <RouterLink
          to="/dimensions"
          class="flex items-center gap-1.5 text-xs py-1 px-3 rounded-md transition-colors"
          :class="isActive('/dimensions') ? 'bg-primary text-primary-foreground font-medium' : 'text-muted-foreground'"
        >
          <Layers class="size-3.5" />
          多维分析
        </RouterLink>
        <RouterLink
          to="/risks"
          class="flex items-center gap-1.5 text-xs py-1 px-3 rounded-md transition-colors"
          :class="isActive('/risks') ? 'bg-primary text-primary-foreground font-medium' : 'text-muted-foreground'"
        >
          <AlertTriangle class="size-3.5" />
          风险预警
        </RouterLink>
      </div>
    </header>

    <!-- 全局快捷跳转搜索指令框 -->
    <CommandDialog v-model:open="commandOpen" :items="commandItems" />

    <!-- 核心视图页面注入区域 -->
    <main class="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <RouterView v-slot="{ Component }">
        <Transition name="page-fade" mode="out-in">
          <component :is="Component" />
        </Transition>
      </RouterView>
    </main>

    <!-- 页脚状态条 -->
    <footer class="mt-auto border-t border-border/40 py-4 text-xs text-muted-foreground bg-muted/10">
      <div class="mx-auto flex w-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div class="flex items-center gap-2">
          <span class="font-semibold text-foreground">New-Pro</span>
          <Badge variant="outline" class="h-4.5 px-1.5 text-[10px]">v1.0.0</Badge>
        </div>
        <div class="flex items-center gap-3">
          <span class="flex items-center gap-1.5 text-[11px]">
            <span
              class="size-2 rounded-full transition-colors"
              :class="pulse.wsConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'"
            />
            <span class="text-muted-foreground">{{ pulse.wsConnected ? 'WS 实时流已连接' : 'WS 正在连接...' }}</span>
          </span>
          <span class="flex items-center gap-1.5 text-[11px]">
            <Database class="size-3.5 text-emerald-500" />
            <span class="text-muted-foreground">PostgreSQL:</span>
            <span class="text-emerald-600 dark:text-emerald-400 font-medium">正常通信</span>
          </span>
        </div>
      </div>
    </footer>
  </div>
</template>
