<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  Activity,
  AlertCircle,
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  Bell,
  BellOff,
  CheckCircle2,
  Coins,
  Cpu,
  Eye,
  Filter,
  Flame,
  Globe,
  Info,
  Key,
  MapPin,
  Radio,
  Search,
  Server,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Users,
  Wifi,
  WifiOff,
  Zap,
} from 'lucide-vue-next';
import { useAlertsStore } from '@/stores/alerts';
import { useDimensionStore } from '@/stores/dimension';
import { useLogsStore } from '@/stores/logs';
import { useWsStore } from '@/stores/ws';
import { fmtCost, fmtDuration, fmtNumber, fmtTime, fmtTokens } from '@/composables/format';
import AlertBadge from '@/components/ui/AlertBadge.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import type { Alert, AlertSeverity, DimensionType } from '@/api/types';

const router = useRouter();
const alerts = useAlertsStore();
const dimStore = useDimensionStore();
const logsStore = useLogsStore();
const ws = useWsStore();

type MainTab = 'alerts' | 'ips' | 'channels' | 'whales';
const mainTab = ref<MainTab>('alerts');

type SeverityFilter = 'all' | AlertSeverity;
const severity = ref<SeverityFilter>('all');

onMounted(() => {
  void alerts.load();
});

const isLive = computed(() => ws.status === 'open');

// 规则分类定义
const CATEGORY_MAP: Record<string, { label: string; icon: typeof Server; color: string }> = {
  'channel-outage': { label: '上游渠道熔断', icon: Server, color: 'text-rose-500' },
  'model-exhaustion': { label: '模型无可用渠道', icon: Cpu, color: 'text-rose-600' },
  'error-rate': { label: '网关高错误率', icon: AlertTriangle, color: 'text-rose-500' },
  'ip-abuse-probe': { label: '恶意防刷探测', icon: ShieldAlert, color: 'text-amber-500' },
  'ip-high-freq': { label: '高频 IP 突增', icon: Globe, color: 'text-amber-500' },
  'token-high-quota': { label: 'Token 额度超标', icon: Key, color: 'text-amber-500' },
  'cancellation-surge': { label: '客户端中断潮', icon: WifiOff, color: 'text-indigo-500' },
  'whale-request': { label: '大额单次调用', icon: Flame, color: 'text-blue-500' },
  'cost-high-daily': { label: '单日预算监控', icon: Coins, color: 'text-emerald-500' },
};

function getRuleMeta(ruleId: string) {
  return (
    CATEGORY_MAP[ruleId] ?? {
      label: ruleId,
      icon: AlertCircle,
      color: 'text-slate-500',
    }
  );
}

// 提取结构化数据
const highRiskIps = computed<any[]>(() => {
  return (alerts.summaries['abuse-detection']?.highRiskIps as any[]) || [];
});

const channelOutages = computed<any[]>(() => {
  return (alerts.summaries['channel-health']?.channels as any[]) || [];
});

const modelExhaustions = computed<any[]>(() => {
  return (alerts.summaries['channel-health']?.models as any[]) || [];
});

const whaleRecords = computed<any[]>(() => {
  return (alerts.summaries['abuse-detection']?.whaleRecords as any[]) || [];
});

// 筛选后的当前活跃告警
const filteredActive = computed(() => {
  return alerts.active.filter((a) => {
    if (severity.value !== 'all' && a.severity !== severity.value) return false;
    return true;
  });
});

// 快捷下钻
function handleAction(alert: Alert) {
  if (alert.ruleId === 'channel-outage' || alert.ruleId.includes('channel')) {
    dimStore.setType('channel');
    void router.push('/dimensions');
  } else if (alert.ruleId === 'ip-abuse-probe' || alert.ruleId === 'ip-high-freq') {
    dimStore.setType('ip');
    void router.push('/dimensions');
  } else if (alert.ruleId === 'model-exhaustion') {
    dimStore.setType('model');
    void router.push('/dimensions');
  } else if (alert.ruleId === 'token-high-quota') {
    dimStore.setType('token');
    void router.push('/dimensions');
  } else {
    void router.push('/logs');
  }
}

function filterIpInLogs(ip: string) {
  void logsStore.search({ ip });
  void router.push('/logs');
}
</script>

<template>
  <div class="space-y-4.5">
    <!-- ═════════════════════════════════════════════════════════════════ -->
    <!-- 第 1 层：4 大风控核心看板                                         -->
    <!-- ═════════════════════════════════════════════════════════════════ -->
    <div class="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
      <!-- 1. 活跃告警 -->
      <div
        class="cursor-pointer rounded-2xl border border-slate-200/80 bg-white p-4.5 shadow-xs transition-all hover:border-blue-400 dark:border-slate-800/80 dark:bg-[#111827]"
        :class="mainTab === 'alerts' ? 'ring-2 ring-blue-500/20 border-blue-500' : ''"
        @click="mainTab = 'alerts'"
      >
        <div class="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <span class="font-semibold">当前预警事件</span>
          <div class="flex size-7 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
            <Bell class="size-3.5" />
          </div>
        </div>
        <div class="mt-2 flex items-baseline gap-2">
          <span class="text-xl font-bold tracking-tight tabular-nums text-slate-800 dark:text-slate-100">
            {{ alerts.active.length }}
          </span>
          <span class="text-xs text-slate-400 font-medium">项触发</span>
        </div>
        <div class="mt-2.5 border-t border-slate-100/80 pt-2 text-xs text-slate-400 dark:border-slate-800/80">
          实时 WebSocket 持续监测中
        </div>
      </div>

      <!-- 2. 恶意与高危 IP -->
      <div
        class="cursor-pointer rounded-2xl border border-slate-200/80 bg-white p-4.5 shadow-xs transition-all hover:border-amber-400 dark:border-slate-800/80 dark:bg-[#111827]"
        :class="mainTab === 'ips' ? 'ring-2 ring-amber-500/20 border-amber-500' : ''"
        @click="mainTab = 'ips'"
      >
        <div class="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <span class="font-semibold">恶意与高危 IP 拦截</span>
          <div class="flex size-7 items-center justify-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400">
            <ShieldAlert class="size-3.5" />
          </div>
        </div>
        <div class="mt-2 flex items-baseline gap-2">
          <span
            class="text-xl font-bold tracking-tight tabular-nums"
            :class="highRiskIps.length > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-800 dark:text-slate-100'"
          >
            {{ highRiskIps.length }}
          </span>
          <span class="text-xs text-slate-400 font-medium">个高危 IP</span>
        </div>
        <div class="mt-2.5 border-t border-slate-100/80 pt-2 text-xs text-slate-400 dark:border-slate-800/80 truncate">
          高频探测与暴力报错扫描
        </div>
      </div>

      <!-- 3. 上游渠道与模型故障 -->
      <div
        class="cursor-pointer rounded-2xl border border-slate-200/80 bg-white p-4.5 shadow-xs transition-all hover:border-rose-400 dark:border-slate-800/80 dark:bg-[#111827]"
        :class="mainTab === 'channels' ? 'ring-2 ring-rose-500/20 border-rose-500' : ''"
        @click="mainTab = 'channels'"
      >
        <div class="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <span class="font-semibold">渠道熔断与通道故障</span>
          <div class="flex size-7 items-center justify-center rounded-xl bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400">
            <Server class="size-3.5" />
          </div>
        </div>
        <div class="mt-2 flex items-baseline gap-2">
          <span
            class="text-xl font-bold tracking-tight tabular-nums"
            :class="channelOutages.length > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-800 dark:text-slate-100'"
          >
            {{ channelOutages.length }}
          </span>
          <span class="text-xs text-slate-400 font-medium">个异常渠道</span>
        </div>
        <div class="mt-2.5 border-t border-slate-100/80 pt-2 text-xs text-slate-400 dark:border-slate-800/80 truncate">
          503 账号池枯竭与 404 死链
        </div>
      </div>

      <!-- 4. 单次大额消费异动 -->
      <div
        class="cursor-pointer rounded-2xl border border-slate-200/80 bg-white p-4.5 shadow-xs transition-all hover:border-indigo-400 dark:border-slate-800/80 dark:bg-[#111827]"
        :class="mainTab === 'whales' ? 'ring-2 ring-indigo-500/20 border-indigo-500' : ''"
        @click="mainTab = 'whales'"
      >
        <div class="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <span class="font-semibold">大额调用异动 (Whales)</span>
          <div class="flex size-7 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400">
            <Flame class="size-3.5" />
          </div>
        </div>
        <div class="mt-2 flex items-baseline gap-2">
          <span class="text-xl font-bold tracking-tight tabular-nums text-indigo-600 dark:text-indigo-400">
            {{ whaleRecords.length }}
          </span>
          <span class="text-xs text-slate-400 font-medium">笔大额调用</span>
        </div>
        <div class="mt-2.5 border-t border-slate-100/80 pt-2 text-xs text-slate-400 dark:border-slate-800/80 truncate">
          单次 &gt; $1.0 或 &gt; 100K Token
        </div>
      </div>
    </div>

    <!-- ═════════════════════════════════════════════════════════════════ -->
    <!-- 第 2 层：工作区 Tab 导航                                          -->
    <!-- ═════════════════════════════════════════════════════════════════ -->
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex flex-wrap items-center gap-1.5 rounded-xl border border-slate-200/80 bg-white p-1 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <button
          type="button"
          class="rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all"
          :class="mainTab === 'alerts' ? 'bg-blue-500 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'"
          @click="mainTab = 'alerts'"
        >
          🚨 实时预警事件 ({{ filteredActive.length }})
        </button>
        <button
          type="button"
          class="rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all"
          :class="mainTab === 'ips' ? 'bg-blue-500 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'"
          @click="mainTab = 'ips'"
        >
          🛡️ 恶意高危 IP 画像 ({{ highRiskIps.length }})
        </button>
        <button
          type="button"
          class="rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all"
          :class="mainTab === 'channels' ? 'bg-blue-500 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'"
          @click="mainTab = 'channels'"
        >
          ⚡ 上游渠道故障雷达 ({{ channelOutages.length }})
        </button>
        <button
          type="button"
          class="rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all"
          :class="mainTab === 'whales' ? 'bg-blue-500 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'"
          @click="mainTab = 'whales'"
        >
          🐋 单次大额异动记录 ({{ whaleRecords.length }})
        </button>
      </div>

      <!-- 仅在事件列表时显示级别过滤 -->
      <div v-if="mainTab === 'alerts'" class="flex items-center gap-1.5 text-xs font-medium">
        <button
          type="button"
          class="rounded-lg border px-2.5 py-1 transition-colors"
          :class="severity === 'all' ? 'border-slate-400 bg-slate-100 font-semibold text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100' : 'border-transparent text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-900'"
          @click="severity = 'all'"
        >
          全部
        </button>
        <button
          type="button"
          class="rounded-lg border px-2.5 py-1 transition-colors"
          :class="severity === 'critical' ? 'border-rose-300 bg-rose-50 font-semibold text-rose-600 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-400' : 'border-transparent text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-900'"
          @click="severity = 'critical'"
        >
          严重
        </button>
        <button
          type="button"
          class="rounded-lg border px-2.5 py-1 transition-colors"
          :class="severity === 'warning' ? 'border-amber-300 bg-amber-50 font-semibold text-amber-600 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-400' : 'border-transparent text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-900'"
          @click="severity = 'warning'"
        >
          警告
        </button>
        <button
          type="button"
          class="rounded-lg border px-2.5 py-1 transition-colors"
          :class="severity === 'info' ? 'border-sky-300 bg-sky-50 font-semibold text-sky-600 dark:border-sky-500/40 dark:bg-sky-500/10 dark:text-sky-400' : 'border-transparent text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-900'"
          @click="severity = 'info'"
        >
          提示
        </button>
      </div>
    </div>

    <!-- ═════════════════════════════════════════════════════════════════ -->
    <!-- Tab 1: 实时预警事件流                                             -->
    <!-- ═════════════════════════════════════════════════════════════════ -->
    <div v-if="mainTab === 'alerts'" class="rounded-2xl border border-slate-200/80 bg-white shadow-xs dark:border-slate-800/80 dark:bg-[#111827]">
      <div class="flex items-center justify-between border-b border-slate-100 px-4.5 py-3.5 dark:border-slate-800">
        <h2 class="text-sm font-semibold text-slate-800 dark:text-slate-100">
          活跃预警事件 ({{ filteredActive.length }} 项)
        </h2>
      </div>

      <div v-if="filteredActive.length === 0" class="py-12 text-center text-slate-400">
        <EmptyState text="当前无符合条件的告警事件，系统运行平稳" />
      </div>

      <div v-else class="divide-y divide-slate-100 dark:divide-slate-800/60">
        <div
          v-for="a in filteredActive"
          :key="a.id"
          class="flex flex-col gap-3 p-4.5 transition-colors hover:bg-slate-50/60 dark:hover:bg-slate-800/30 sm:flex-row sm:items-center sm:justify-between"
        >
          <div class="flex items-start gap-3.5 min-w-0">
            <div class="mt-0.5">
              <AlertBadge :severity="a.severity" />
            </div>

            <div class="min-w-0 space-y-1.5">
              <div class="flex flex-wrap items-center gap-2">
                <span class="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  {{ getRuleMeta(a.ruleId).label }}
                </span>
                <span class="text-xs text-slate-400 font-mono">
                  {{ fmtTime(a.timestamp) }}
                </span>
              </div>

              <!-- 明确的问题与诊断描述 -->
              <p class="text-xs font-semibold text-slate-800 dark:text-slate-100 leading-relaxed break-words">
                {{ a.message }}
              </p>

              <!-- 结构化上下文 Details -->
              <div v-if="a.details" class="flex flex-wrap gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span v-for="(val, k) in a.details" :key="k" class="rounded bg-slate-50 px-2 py-0.5 dark:bg-slate-950/60 font-mono">
                  <span class="text-slate-400">{{ k }}:</span> {{ String(val) }}
                </span>
              </div>
            </div>
          </div>

          <!-- 快速排查动作 -->
          <div class="shrink-0 pt-1 sm:pt-0">
            <button
              type="button"
              class="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-blue-600 shadow-2xs hover:bg-blue-50 hover:text-blue-700 dark:border-slate-700 dark:bg-slate-800 dark:text-blue-400 dark:hover:bg-slate-700"
              @click="handleAction(a)"
            >
              <span>快速排查</span>
              <ArrowRight class="size-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ═════════════════════════════════════════════════════════════════ -->
    <!-- Tab 2: 恶意与高危 IP 拦截分析                                     -->
    <!-- ═════════════════════════════════════════════════════════════════ -->
    <div v-else-if="mainTab === 'ips'" class="rounded-2xl border border-slate-200/80 bg-white shadow-xs dark:border-slate-800/80 dark:bg-[#111827]">
      <div class="border-b border-slate-100 px-4.5 py-3.5 dark:border-slate-800">
        <h2 class="text-sm font-semibold text-slate-800 dark:text-slate-100">
          高频异常报错与恶意探测 IP 清单 (共 {{ highRiskIps.length }} 个)
        </h2>
        <p class="mt-0.5 text-xs text-slate-400">针对 4xx / 5xx 持续高频报错的客户端 IP 来源画像与物理归属地</p>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full text-left text-xs">
          <thead>
            <tr class="border-b border-slate-100 bg-slate-50/50 text-slate-400 dark:border-slate-800 dark:bg-slate-950/40">
              <th class="py-2.5 pl-4 font-semibold">恶意 IP 地址</th>
              <th class="py-2.5 font-semibold">IP 物理归属地</th>
              <th class="py-2.5 text-right font-semibold">总请求量</th>
              <th class="py-2.5 text-right font-semibold">失败报错次数</th>
              <th class="py-2.5 text-right font-semibold">失败率</th>
              <th class="py-2.5 pr-4 text-center font-semibold">操作</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100/70 dark:divide-slate-800/50">
            <tr v-for="ip in highRiskIps" :key="ip.ip" class="hover:bg-slate-50/60 dark:hover:bg-slate-800/30">
              <td class="py-3 pl-4 font-mono font-bold text-slate-800 dark:text-slate-100">{{ ip.ip }}</td>
              <td class="py-3 font-medium text-indigo-500 dark:text-indigo-400">{{ ip.location || '未知' }}</td>
              <td class="py-3 text-right tabular-nums text-slate-600 dark:text-slate-300">{{ fmtNumber(ip.totalRequests) }} 次</td>
              <td class="py-3 text-right font-semibold tabular-nums text-rose-500">{{ ip.errorCount }} 次</td>
              <td class="py-3 text-right font-bold tabular-nums text-rose-600 dark:text-rose-400">{{ ip.errorRate }}</td>
              <td class="py-3 pr-4 text-center">
                <button
                  type="button"
                  class="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-3xs font-medium text-blue-500 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800"
                  @click="filterIpInLogs(ip.ip)"
                >
                  日志过滤
                </button>
              </td>
            </tr>
            <tr v-if="highRiskIps.length === 0">
              <td colspan="6" class="py-10 text-center text-slate-400">暂无恶意 IP 探测记录</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- ═════════════════════════════════════════════════════════════════ -->
    <!-- Tab 3: 上游渠道故障雷达                                           -->
    <!-- ═════════════════════════════════════════════════════════════════ -->
    <div v-else-if="mainTab === 'channels'" class="rounded-2xl border border-slate-200/80 bg-white shadow-xs dark:border-slate-800/80 dark:bg-[#111827]">
      <div class="border-b border-slate-100 px-4.5 py-3.5 dark:border-slate-800">
        <h2 class="text-sm font-semibold text-slate-800 dark:text-slate-100">
          上游渠道故障与熔断诊断 (共 {{ channelOutages.length }} 个)
        </h2>
        <p class="mt-0.5 text-xs text-slate-400">自动提取 `[ERR]` 日志中的真实渠道错误归因与 503 账号池状态</p>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full text-left text-xs">
          <thead>
            <tr class="border-b border-slate-100 bg-slate-50/50 text-slate-400 dark:border-slate-800 dark:bg-slate-950/40">
              <th class="py-2.5 pl-4 font-semibold">渠道 ID</th>
              <th class="py-2.5 text-right font-semibold">累计失败次数</th>
              <th class="py-2.5 font-semibold">状态码分布</th>
              <th class="py-2.5 font-semibold">主要报错诊断信息</th>
              <th class="py-2.5 pr-4 text-center font-semibold">建议操作</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100/70 dark:divide-slate-800/50">
            <tr v-for="ch in channelOutages" :key="ch.channelId" class="hover:bg-slate-50/60 dark:hover:bg-slate-800/30">
              <td class="py-3 pl-4 font-bold text-slate-800 dark:text-slate-100">Channel #{{ ch.channelId }}</td>
              <td class="py-3 text-right font-bold tabular-nums text-rose-500">{{ ch.totalFailures.toLocaleString() }} 次</td>
              <td class="py-3 font-mono text-slate-600 dark:text-slate-300">
                <span v-for="(cnt, code) in ch.statusCodes" :key="code" class="mr-1.5 rounded bg-rose-50 px-1.5 py-0.5 text-3xs font-medium text-rose-600 dark:bg-rose-500/10 dark:text-rose-400">
                  {{ code }}x{{ cnt }}
                </span>
              </td>
              <td class="max-w-md py-3 text-slate-700 dark:text-slate-300" :title="ch.sampleMessage">
                {{ ch.sampleMessage || '上游返回异常状态码' }}
              </td>
              <td class="py-3 pr-4 text-center">
                <button
                  type="button"
                  class="rounded-md bg-rose-50 px-2.5 py-1 text-3xs font-semibold text-rose-600 hover:bg-rose-100 dark:bg-rose-500/10 dark:text-rose-400"
                  @click="dimStore.setType('channel'); router.push('/dimensions')"
                >
                  渠道下钻
                </button>
              </td>
            </tr>
            <tr v-if="channelOutages.length === 0">
              <td colspan="5" class="py-10 text-center text-slate-400">暂无渠道故障记录</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- ═════════════════════════════════════════════════════════════════ -->
    <!-- Tab 4: 单次大额异动记录                                           -->
    <!-- ═════════════════════════════════════════════════════════════════ -->
    <div v-else-if="mainTab === 'whales'" class="rounded-2xl border border-slate-200/80 bg-white shadow-xs dark:border-slate-800/80 dark:bg-[#111827]">
      <div class="border-b border-slate-100 px-4.5 py-3.5 dark:border-slate-800">
        <h2 class="text-sm font-semibold text-slate-800 dark:text-slate-100">
          大额单次消费异动记录 (共 {{ whaleRecords.length }} 笔)
        </h2>
        <p class="mt-0.5 text-xs text-slate-400">单次调用消耗 &gt; $1.0 或 Prompt Token &gt; 100K 的大额记录</p>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full text-left text-xs">
          <thead>
            <tr class="border-b border-slate-100 bg-slate-50/50 text-slate-400 dark:border-slate-800 dark:bg-slate-950/40">
              <th class="py-2.5 pl-4 font-semibold">请求时间</th>
              <th class="py-2.5 font-semibold">模型名称</th>
              <th class="py-2.5 font-semibold">用户 / 令牌</th>
              <th class="py-2.5 font-semibold">客户端 IP / 归属地</th>
              <th class="py-2.5 text-right font-semibold">单次金额 ($)</th>
              <th class="py-2.5 text-right font-semibold">Token (输入 / 输出)</th>
              <th class="py-2.5 pr-4 text-center font-semibold">操作</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100/70 dark:divide-slate-800/50">
            <tr v-for="w in whaleRecords" :key="w.requestId" class="hover:bg-slate-50/60 dark:hover:bg-slate-800/30">
              <td class="py-3 pl-4 font-mono text-slate-500 dark:text-slate-400">{{ fmtTime(w.timestamp) }}</td>
              <td class="py-3 font-bold text-slate-800 dark:text-slate-100">{{ w.model }}</td>
              <td class="py-3 text-slate-700 dark:text-slate-200">User #{{ w.userId }} ({{ w.tokenName }})</td>
              <td class="py-3">
                <span class="font-mono text-slate-700 dark:text-slate-300">{{ w.ip || '—' }}</span>
                <span v-if="w.ipLocation" class="ml-1 text-3xs text-indigo-500 font-medium">({{ w.ipLocation }})</span>
              </td>
              <td class="py-3 text-right font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{{ fmtCost(w.cost) }}</td>
              <td class="py-3 text-right tabular-nums text-slate-600 dark:text-slate-300">
                {{ fmtNumber(w.promptTokens) }} / {{ fmtNumber(w.completionTokens) }}
              </td>
              <td class="py-3 pr-4 text-center">
                <button
                  type="button"
                  class="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-3xs font-medium text-blue-500 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800"
                  @click="void logsStore.search({ q: w.requestId }); router.push('/logs')"
                >
                  日志定位
                </button>
              </td>
            </tr>
            <tr v-if="whaleRecords.length === 0">
              <td colspan="7" class="py-10 text-center text-slate-400">暂无大额消费记录</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
