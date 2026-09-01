<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import {
  Activity,
  Check,
  ChevronRight,
  Clock,
  Coins,
  Copy,
  Cpu,
  Database,
  ExternalLink,
  Eye,
  FileCode,
  FileSearch,
  Filter,
  Flame,
  Globe,
  Key,
  MapPin,
  Pause,
  Play,
  Radio,
  RotateCcw,
  Search,
  Server,
  Sparkles,
  Tag,
  Trash2,
  Users,
  X,
  Zap,
} from 'lucide-vue-next';
import { useLogsStore } from '@/stores/logs';
import { useTimeRangeStore } from '@/stores/timeRange';
import { fmtCost, fmtDuration, fmtNumber, fmtTime, fmtTokens } from '@/composables/format';
import Pagination from '@/components/ui/Pagination.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import type { LogEntry } from '@/api/types';

const store = useLogsStore();
const tr = useTimeRangeStore();

const filters = reactive({
  q: '',
  model: '',
  user: '',
  channel: '',
  ip: '',
});

const selectedLog = ref<LogEntry | null>(null);
const copiedId = ref<string | null>(null);

function doSearch(targetPage = 1): void {
  void store.search(
    {
      q: filters.q.trim() || undefined,
      model: filters.model.trim() || undefined,
      user: filters.user.trim() || undefined,
      channel: filters.channel.trim() || undefined,
      ip: filters.ip.trim() || undefined,
      start: tr.range.start,
      end: tr.range.end,
    },
    targetPage,
  );
}

function clearFilters(): void {
  filters.q = '';
  filters.model = '';
  filters.user = '';
  filters.channel = '';
  filters.ip = '';
  doSearch(1);
}

function quickFilterIp(ip: string): void {
  filters.ip = ip;
  doSearch(1);
}

function quickFilterModel(model: string): void {
  filters.model = model;
  doSearch(1);
}

function quickFilterChannel(channelId: number): void {
  filters.channel = String(channelId);
  doSearch(1);
}

onMounted(() => {
  doSearch(1);
});

watch(() => tr.preset, () => {
  doSearch(1);
});

function hasActiveFilters(): boolean {
  return Boolean(filters.q || filters.model || filters.user || filters.channel || filters.ip);
}

function copyText(text: string): void {
  navigator.clipboard.writeText(text);
  copiedId.value = text;
  setTimeout(() => {
    if (copiedId.value === text) copiedId.value = null;
  }, 2000);
}

/**
 * 吐字速度计算（Tokens Per Second / TPS）
 * 与 NewAPI 官方算法对齐：生成 Token 数 / 请求总耗时 (秒)
 * 例如 82 tokens / 11.0s = 7.45 -> 7.5 t/s
 */
function calcSpeed(log: LogEntry): string | null {
  if (!log.completionTokens || log.completionTokens <= 0) return null;
  if (!log.useTime || log.useTime <= 0) return null;
  const tps = log.completionTokens / log.useTime;
  if (tps < 0.1) return null;
  return tps >= 10 ? `${Math.round(tps)} t/s` : `${tps.toFixed(1)} t/s`;
}

// 格式化计费模式说明
function formatBillingInfo(log: LogEntry): string {
  const parts: string[] = [];
  if (log.billingMode) {
    parts.push(log.billingMode === 'tiered_expr' ? '阶梯计费' : log.billingMode);
  } else {
    parts.push('标准');
  }
  if (log.modelRatio !== null && log.modelRatio !== undefined && log.modelRatio > 0) {
    parts.push(`倍率 ${log.modelRatio}`);
  }
  if (log.matchedTier) {
    parts.push(`阶梯 ${log.matchedTier}`);
  }
  return parts.join(' · ');
}
</script>

<template>
  <div class="space-y-4.5">
    <!-- ═════════════════════════════════════════════════════════════════ -->
    <!-- 第 1 层：多维即时筛选工具栏                                       -->
    <!-- ═════════════════════════════════════════════════════════════════ -->
    <div class="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs dark:border-slate-800/80 dark:bg-[#111827]">
      <div class="flex flex-wrap items-center gap-2.5">
        <!-- 关键词 -->
        <div class="relative flex-1 min-w-[200px]">
          <Search class="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
          <input
            v-model="filters.q"
            type="text"
            placeholder="搜索关键词 (模型/分组/令牌/请求ID)..."
            class="h-9 w-full rounded-xl border border-slate-200 bg-white pl-8.5 pr-3 text-xs text-slate-700 placeholder-slate-400 focus:border-blue-400 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
            @keyup.enter="doSearch(1)"
          />
        </div>

        <!-- 客户端 IP 独立输入 -->
        <div class="relative">
          <Globe class="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
          <input
            v-model="filters.ip"
            type="text"
            placeholder="客户端 IP"
            class="h-9 w-38 rounded-xl border border-slate-200 bg-white pl-8 pr-3 text-xs text-slate-700 placeholder-slate-400 focus:border-blue-400 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
            @keyup.enter="doSearch(1)"
          />
        </div>

        <!-- 模型名称 -->
        <input
          v-model="filters.model"
          type="text"
          placeholder="模型名称"
          class="h-9 w-36 rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-700 placeholder-slate-400 focus:border-blue-400 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
          @keyup.enter="doSearch(1)"
        />

        <!-- 渠道 ID -->
        <input
          v-model="filters.channel"
          type="text"
          placeholder="渠道 ID (#23)"
          class="h-9 w-28 rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-700 placeholder-slate-400 focus:border-blue-400 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
          @keyup.enter="doSearch(1)"
        />

        <!-- 用户 ID -->
        <input
          v-model="filters.user"
          type="text"
          placeholder="用户 ID (#1)"
          class="h-9 w-24 rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-700 placeholder-slate-400 focus:border-blue-400 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
          @keyup.enter="doSearch(1)"
        />

        <!-- 操作按钮 -->
        <button
          type="button"
          class="flex h-9 items-center gap-1.5 rounded-xl bg-blue-500 px-4 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-blue-600"
          @click="doSearch(1)"
        >
          <Search class="size-3.5" />
          <span>查询</span>
        </button>

        <button
          v-if="hasActiveFilters()"
          type="button"
          class="flex h-9 items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800"
          @click="clearFilters"
        >
          <RotateCcw class="size-3.5" />
          <span>重置</span>
        </button>
      </div>
    </div>

    <!-- ═════════════════════════════════════════════════════════════════ -->
    <!-- 第 2 层：NewAPI 专业样式日志表格（带 IP 与归属地）                 -->
    <!-- ═════════════════════════════════════════════════════════════════ -->
    <div class="rounded-2xl border border-slate-200/80 bg-white shadow-xs dark:border-slate-800/80 dark:bg-[#111827]">
      <div class="flex flex-wrap items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800">
        <div class="flex items-center gap-2">
          <FileSearch class="size-4 text-blue-500" />
          <h2 class="text-sm font-semibold text-slate-800 dark:text-slate-100">
            调用消费日志明细
          </h2>
          <span class="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            共 {{ store.total.toLocaleString() }} 条记录
          </span>
        </div>

        <!-- 实时推流控制器 -->
        <div class="flex items-center gap-2">
          <div
            class="flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium"
            :class="
              store.liveEnabled
                ? 'bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20'
                : 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'
            "
          >
            <span class="size-1.5 rounded-full" :class="store.liveEnabled ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'" />
            <span>{{ store.liveEnabled ? '实时推流同步中' : '实时流已暂停' }}</span>
          </div>

          <button
            type="button"
            class="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            @click="store.toggleLive()"
          >
            <Pause v-if="store.liveEnabled" class="size-3" />
            <Play v-else class="size-3" />
            <span>{{ store.liveEnabled ? '暂停' : '恢复' }}</span>
          </button>
        </div>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full text-left text-xs">
          <thead>
            <tr class="border-b border-slate-100 bg-slate-50/50 text-slate-400 dark:border-slate-800 dark:bg-slate-950/40">
              <th class="py-2.5 pl-4 font-semibold">时间</th>
              <th class="py-2.5 font-semibold">渠道</th>
              <th class="py-2.5 font-semibold">客户端 IP / 归属地</th>
              <th class="py-2.5 font-semibold">令牌 / 分组</th>
              <th class="py-2.5 font-semibold">模型</th>
              <th class="py-2.5 font-semibold">流 / 吐字速率</th>
              <th class="py-2.5 text-right font-semibold">Tokens (输入 / 输出)</th>
              <th class="py-2.5 text-right font-semibold">费用 ($ / 配额)</th>
              <th class="py-2.5 text-right font-semibold">耗时 (首字 / 总耗时)</th>
              <th class="py-2.5 pl-3 font-semibold">计费模式</th>
              <th class="py-2.5 pr-4 text-center font-semibold">操作</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100/70 dark:divide-slate-800/50">
            <tr
              v-for="log in store.results"
              :key="`${log.timestamp}-${log.requestId}`"
              class="cursor-pointer transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
              @click="selectedLog = log"
            >
              <!-- 1. 时间 + 类型 -->
              <td class="py-3 pl-4 whitespace-nowrap">
                <div class="font-mono text-slate-700 dark:text-slate-200">
                  {{ fmtTime(log.timestamp) }}
                </div>
                <div class="mt-0.5">
                  <span class="rounded bg-emerald-50 px-1.5 py-0.5 text-3xs font-medium text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
                    消耗
                  </span>
                </div>
              </td>

              <!-- 2. 渠道 (支持点击快速筛选) -->
              <td class="py-3 whitespace-nowrap">
                <div
                  class="font-semibold text-slate-800 hover:text-blue-500 dark:text-slate-100"
                  title="点击筛选此渠道"
                  @click.stop="quickFilterChannel(log.channelId)"
                >
                  #{{ log.channelId }}
                </div>
                <div class="mt-0.5 text-3xs text-slate-400" :title="log.billingSource || 'wallet'">
                  {{ log.billingSource || 'wallet' }}
                </div>
              </td>

              <!-- 3. 客户端 IP + 归属地 (支持点击快速筛选) -->
              <td class="py-3 whitespace-nowrap">
                <div v-if="log.ip" class="flex flex-col">
                  <div class="flex items-center gap-1">
                    <span
                      class="font-mono text-slate-800 hover:text-blue-500 dark:text-slate-200 font-semibold"
                      title="点击筛选此 IP"
                      @click.stop="quickFilterIp(log.ip)"
                    >
                      {{ log.ip }}
                    </span>
                    <button
                      type="button"
                      class="text-slate-400 hover:text-blue-500"
                      title="复制 IP"
                      @click.stop="copyText(log.ip)"
                    >
                      <Check v-if="copiedId === log.ip" class="size-2.5 text-emerald-500" />
                      <Copy v-else class="size-2.5" />
                    </button>
                  </div>
                  <div class="mt-0.5 flex items-center gap-1 text-3xs font-medium text-indigo-500 dark:text-indigo-400">
                    <MapPin class="size-2.5 shrink-0" />
                    <span>{{ log.ipLocation || '未知' }}</span>
                  </div>
                </div>
                <span v-else class="text-slate-400">—</span>
              </td>

              <!-- 4. 令牌 / 分组 / 用户 -->
              <td class="py-3 whitespace-nowrap">
                <div class="font-medium text-slate-700 dark:text-slate-200" :title="log.tokenName">
                  {{ log.tokenName || 'default' }}
                </div>
                <div class="mt-0.5 flex items-center gap-1.5 text-3xs text-slate-400">
                  <span class="rounded bg-slate-100 px-1 py-0.2 dark:bg-slate-800">User #{{ log.userId }}</span>
                  <span>{{ log.group || 'default' }}</span>
                </div>
              </td>

              <!-- 5. 模型名称 (支持点击快速筛选) -->
              <td class="py-3 whitespace-nowrap">
                <div
                  class="font-semibold text-slate-800 hover:text-blue-500 dark:text-slate-100"
                  :title="log.model"
                  @click.stop="quickFilterModel(log.model)"
                >
                  {{ log.model }}
                </div>
                <div class="mt-0.5 flex items-center gap-1 text-3xs font-mono text-slate-400">
                  <span>{{ log.requestId.slice(0, 14) }}…</span>
                  <button
                    type="button"
                    class="hover:text-blue-500"
                    title="复制 Request ID"
                    @click.stop="copyText(log.requestId)"
                  >
                    <Check v-if="copiedId === log.requestId" class="size-2.5 text-emerald-500" />
                    <Copy v-else class="size-2.5" />
                  </button>
                </div>
              </td>

              <!-- 6. 流式 & 真实吐字速率 (t/s) -->
              <td class="py-3 whitespace-nowrap">
                <div class="flex items-center gap-1.5">
                  <span
                    v-if="log.isStream"
                    class="rounded bg-blue-50 px-1.5 py-0.5 text-3xs font-medium text-blue-600 dark:bg-blue-500/10 dark:text-blue-400"
                  >
                    流
                  </span>
                  <span
                    v-else
                    class="rounded bg-slate-100 px-1.5 py-0.5 text-3xs text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                  >
                    非流
                  </span>

                  <!-- 吐字速度: completion_tokens / use_time_seconds -->
                  <span v-if="calcSpeed(log)" class="font-mono text-3xs font-semibold text-indigo-500">
                    {{ calcSpeed(log) }}
                  </span>
                </div>
                <div v-if="log.streamStatus === 'client_gone'" class="mt-0.5 text-3xs text-amber-500">
                  中断已取消
                </div>
              </td>

              <!-- 7. Tokens (Prompt / Completion / Cache) -->
              <td class="py-3 text-right whitespace-nowrap tabular-nums">
                <div class="font-semibold text-slate-800 dark:text-slate-100">
                  {{ log.promptTokens.toLocaleString() }} <span class="text-slate-400 font-normal">/</span> {{ log.completionTokens.toLocaleString() }}
                </div>
                <div v-if="log.cacheTokens > 0" class="mt-0.5 text-3xs font-medium text-emerald-500">
                  ⚡{{ log.cacheTokens.toLocaleString() }} 缓存
                </div>
                <div v-else class="mt-0.5 text-3xs text-slate-400">
                  总 {{ (log.promptTokens + log.completionTokens).toLocaleString() }}
                </div>
              </td>

              <!-- 8. 费用 ($ / 配额) -->
              <td class="py-3 text-right whitespace-nowrap tabular-nums">
                <div class="font-semibold text-emerald-600 dark:text-emerald-400">
                  {{ fmtCost(log.cost) }}
                </div>
                <div class="mt-0.5 text-3xs text-slate-400">
                  {{ fmtNumber(log.quota) }} 配额
                </div>
              </td>

              <!-- 9. 耗时 (首字 / 总耗时) -->
              <td class="py-3 text-right whitespace-nowrap tabular-nums">
                <div v-if="log.frt && log.frt > 0" class="text-3xs text-indigo-500">
                  首字 <span class="font-medium font-mono">{{ (log.frt / 1000).toFixed(1) }}s</span>
                </div>
                <div class="text-slate-700 dark:text-slate-300">
                  耗时 <span class="font-mono">{{ fmtDuration(log.useTime) }}</span>
                </div>
              </td>

              <!-- 10. 计费模式与详情 -->
              <td class="py-3 pl-3 whitespace-nowrap">
                <div class="text-3xs text-slate-600 dark:text-slate-300">
                  {{ formatBillingInfo(log) }}
                </div>
              </td>

              <!-- 11. 操作 -->
              <td class="py-3 pr-4 text-center whitespace-nowrap">
                <button
                  type="button"
                  class="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-blue-500 dark:hover:bg-slate-800"
                  title="查看详情"
                  @click.stop="selectedLog = log"
                >
                  <Eye class="size-3.5" />
                </button>
              </td>
            </tr>

            <tr v-if="store.results.length === 0 && !store.loading">
              <td colspan="11" class="py-12 text-center text-slate-400">
                <EmptyState text="未找到符合条件的日志记录" />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 分页组件 -->
      <Pagination
        :page="store.page"
        :page-size="store.pageSize"
        :total="store.total"
        @update:page="doSearch($event)"
      />
    </div>

    <!-- ═════════════════════════════════════════════════════════════════ -->
    <!-- 详情弹窗 (Log Detail Modal)                                      -->
    <!-- ═════════════════════════════════════════════════════════════════ -->
    <div
      v-if="selectedLog"
      class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-xs"
      @click="selectedLog = null"
    >
      <div
        class="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900"
        @click.stop
      >
        <div class="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
          <div class="flex items-center gap-2">
            <FileCode class="size-5 text-blue-500" />
            <h3 class="text-base font-semibold text-slate-800 dark:text-slate-100">日志结构化详情</h3>
          </div>
          <button
            type="button"
            class="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            @click="selectedLog = null"
          >
            <X class="size-4" />
          </button>
        </div>

        <div class="mt-4 space-y-3 text-xs">
          <div class="grid grid-cols-2 gap-3">
            <div class="rounded-lg bg-slate-50 p-2.5 dark:bg-slate-950/60">
              <span class="text-slate-400">请求 ID (Request ID)</span>
              <div class="mt-0.5 flex items-center justify-between font-mono font-semibold break-all text-slate-700 dark:text-slate-200">
                <span>{{ selectedLog.requestId }}</span>
                <button type="button" class="ml-2 hover:text-blue-500" @click="copyText(selectedLog.requestId)">
                  <Copy class="size-3.5" />
                </button>
              </div>
            </div>
            <div class="rounded-lg bg-slate-50 p-2.5 dark:bg-slate-950/60">
              <span class="text-slate-400">调用时间</span>
              <div class="mt-0.5 font-semibold text-slate-700 dark:text-slate-200">
                {{ fmtTime(selectedLog.timestamp) }}
              </div>
            </div>
          </div>

          <div class="grid grid-cols-3 gap-3">
            <div class="rounded-lg bg-slate-50 p-2.5 dark:bg-slate-950/60">
              <span class="text-slate-400">模型名称</span>
              <div class="mt-0.5 font-semibold text-slate-700 dark:text-slate-200">{{ selectedLog.model }}</div>
            </div>
            <div class="rounded-lg bg-slate-50 p-2.5 dark:bg-slate-950/60">
              <span class="text-slate-400">上游渠道</span>
              <div class="mt-0.5 font-semibold text-slate-700 dark:text-slate-200">Channel #{{ selectedLog.channelId }}</div>
            </div>
            <div class="rounded-lg bg-slate-50 p-2.5 dark:bg-slate-950/60">
              <span class="text-slate-400">用户 ID</span>
              <div class="mt-0.5 font-semibold text-slate-700 dark:text-slate-200">User #{{ selectedLog.userId }}</div>
            </div>
          </div>

          <div class="grid grid-cols-3 gap-3">
            <div class="rounded-lg bg-slate-50 p-2.5 dark:bg-slate-950/60">
              <span class="text-slate-400">客户端 IP 与归属地</span>
              <div class="mt-0.5 font-mono font-semibold text-slate-700 dark:text-slate-200">
                {{ selectedLog.ip || '未知' }}
              </div>
              <div class="text-3xs text-indigo-500 font-medium mt-0.5">
                {{ selectedLog.ipLocation || '未知' }}
              </div>
            </div>
            <div class="rounded-lg bg-slate-50 p-2.5 dark:bg-slate-950/60">
              <span class="text-slate-400">令牌 Key</span>
              <div class="mt-0.5 font-semibold text-slate-700 dark:text-slate-200">{{ selectedLog.tokenName }}</div>
            </div>
            <div class="rounded-lg bg-slate-50 p-2.5 dark:bg-slate-950/60">
              <span class="text-slate-400">用户分组 (Group)</span>
              <div class="mt-0.5 font-semibold text-slate-700 dark:text-slate-200">{{ selectedLog.group || 'default' }}</div>
            </div>
          </div>

          <div class="grid grid-cols-4 gap-3">
            <div class="rounded-lg bg-slate-50 p-2.5 dark:bg-slate-950/60">
              <span class="text-slate-400">消耗金额</span>
              <div class="mt-0.5 font-bold text-emerald-600 dark:text-emerald-400">{{ fmtCost(selectedLog.cost) }}</div>
            </div>
            <div class="rounded-lg bg-slate-50 p-2.5 dark:bg-slate-950/60">
              <span class="text-slate-400">消耗配额</span>
              <div class="mt-0.5 font-semibold tabular-nums text-slate-700 dark:text-slate-200">{{ selectedLog.quota.toLocaleString() }}</div>
            </div>
            <div class="rounded-lg bg-slate-50 p-2.5 dark:bg-slate-950/60">
              <span class="text-slate-400">Token (输入/输出)</span>
              <div class="mt-0.5 font-semibold tabular-nums text-slate-700 dark:text-slate-200">{{ selectedLog.promptTokens.toLocaleString() }} / {{ selectedLog.completionTokens.toLocaleString() }}</div>
            </div>
            <div class="rounded-lg bg-slate-50 p-2.5 dark:bg-slate-950/60">
              <span class="text-slate-400">Prompt 缓存</span>
              <div class="mt-0.5 font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{{ selectedLog.cacheTokens > 0 ? selectedLog.cacheTokens.toLocaleString() : '0' }}</div>
            </div>
          </div>

          <div class="grid grid-cols-3 gap-3">
            <div class="rounded-lg bg-slate-50 p-2.5 dark:bg-slate-950/60">
              <span class="text-slate-400">生成总耗时</span>
              <div class="mt-0.5 font-semibold text-slate-700 dark:text-slate-200">{{ fmtDuration(selectedLog.useTime) }}</div>
            </div>
            <div class="rounded-lg bg-slate-50 p-2.5 dark:bg-slate-950/60">
              <span class="text-slate-400">首字延迟 (FRT)</span>
              <div class="mt-0.5 font-semibold text-indigo-500">{{ selectedLog.frt && selectedLog.frt > 0 ? (selectedLog.frt / 1000).toFixed(2) + 's' : '—' }}</div>
            </div>
            <div class="rounded-lg bg-slate-50 p-2.5 dark:bg-slate-950/60">
              <span class="text-slate-400">流式 / 状态</span>
              <div class="mt-0.5 font-semibold text-slate-700 dark:text-slate-200">{{ selectedLog.isStream ? '流式请求' : '非流式' }} ({{ selectedLog.streamStatus || 'ok' }})</div>
            </div>
          </div>

          <div class="grid grid-cols-3 gap-3">
            <div class="rounded-lg bg-slate-50 p-2.5 dark:bg-slate-950/60">
              <span class="text-slate-400">计费模式</span>
              <div class="mt-0.5 font-semibold text-slate-700 dark:text-slate-200">{{ selectedLog.billingMode || '标准模式' }}</div>
            </div>
            <div class="rounded-lg bg-slate-50 p-2.5 dark:bg-slate-950/60">
              <span class="text-slate-400">模型倍率</span>
              <div class="mt-0.5 font-semibold text-slate-700 dark:text-slate-200">{{ selectedLog.modelRatio ?? '—' }}</div>
            </div>
            <div class="rounded-lg bg-slate-50 p-2.5 dark:bg-slate-950/60">
              <span class="text-slate-400">请求路径</span>
              <div class="mt-0.5 truncate font-semibold text-slate-700 dark:text-slate-200">{{ selectedLog.requestPath || '/v1/chat/completions' }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
