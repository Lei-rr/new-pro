import { computed, ref, watch } from 'vue'
import { analyticsApi } from '@/shared/api/endpoints'
import { useRealtimePulse } from '@/shared/api/websocket'
import { useSessionStore } from '@/features/auth'
import { useAutoRefresh } from '@/shared/composables/useAutoRefresh'
import { toast } from '@/shared/lib/toast'
import { errorMessage } from '@/shared/lib/errors'
import { QUOTA_PER_USD } from '@/shared/lib/utils'
import type { OverviewMetrics, RealtimeLog, TimeRangeKey } from '@/shared/api/types'

const MAX_TRACKED_IDS = 2000
const KEEP_IDS = 1000

/** 静默校准期间保留实时累加出的更大值，避免数字回退 */
const MONOTONIC_KEYS = [
  'totalRequests',
  'successRequests',
  'failedRequests',
  'totalQuota',
  'totalTokens',
  'promptTokens',
  'completionTokens',
  'activeIps',
  'maxLogId',
] as const

/**
 * 大屏数据唯一状态所有者。
 *
 * 状态一致性由「单一写入路径」保证：全量数据与实时累加都经由 commit() 落库，
 * 基线（去重集合 / 起始日志 ID / 已知 IP）只在 commit 内部按口径变化同步，
 * 外部无法绕过，因此不存在基线与视图数据错配的可能。
 */
export function useDashboardData() {
  const session = useSessionStore()
  const overview = ref<OverviewMetrics | null>(null)
  const currentRange = ref<TimeRangeKey>('today')
  const loading = ref(true)
  const refreshing = ref(false)

  const { pulse } = useRealtimePulse()
  const realtimeLogs = computed<RealtimeLog[]>(() => pulse.value?.recentLogs ?? [])

  // ---------------------------------------------------------------- 基线

  const processedIds = new Set<number>()
  const knownIps = new Set<string>()
  let baseLogId = 0
  let appliedRangeKey: string | null = null
  /** 已知 IP 集合被后端截断时，无法判定「新 IP」，暂停累加该指标 */
  let activeIpsIncrementable = false

  function rebuildBaseline(data: OverviewMetrics): void {
    processedIds.clear()
    knownIps.clear()

    appliedRangeKey = data.timeRange.key
    baseLogId = data.summary.maxLogId || 0
    activeIpsIncrementable = !data.knownIpListTruncated

    for (const ip of data.knownIpList) {
      if (ip) knownIps.add(ip)
    }
  }

  function extendBaseline(data: OverviewMetrics): void {
    if (data.summary.maxLogId > baseLogId) baseLogId = data.summary.maxLogId
    for (const ip of data.knownIpList) {
      if (ip) knownIps.add(ip)
    }
  }

  // ---------------------------------------------------------------- 写入

  /** 全量数据落地的唯一入口：按口径变化决定重建或延续基线 */
  function commit(snapshot: OverviewMetrics, options: { keepMonotonic?: boolean } = {}): void {
    const rangeChanged = snapshot.timeRange.key !== appliedRangeKey

    // 仅在口径未变时才允许沿用更大的旧值。
    // 跨区间比较无意义（all 的累计值必然大于 today），
    // 会把上一区间的大数值错误地套用到新区间。
    if (options.keepMonotonic && !rangeChanged && overview.value) {
      applyMonotonic(overview.value, snapshot)
    }

    overview.value = snapshot
    if (rangeChanged) rebuildBaseline(snapshot)
    else extendBaseline(snapshot)
  }

  /** 实时流水落地：聚合增量后以新对象提交，避免就地修改响应式状态 */
  function applyRealtimeLogs(logs: RealtimeLog[]): void {
    const current = overview.value
    if (!current) return

    let requests = 0
    let successes = 0
    let failures = 0
    let quota = 0
    let promptTokens = 0
    let completionTokens = 0
    let newIps = 0

    for (const log of logs) {
      if (!log.id || log.id <= baseLogId || processedIds.has(log.id)) continue
      processedIds.add(log.id)
      requests += 1

      if (log.status === 'success') {
        successes += 1
        quota += log.quota || 0
        promptTokens += log.promptTokens || 0
        completionTokens += log.completionTokens || 0
      } else if (log.status === 'failed') {
        failures += 1
      }

      if (activeIpsIncrementable && log.ip && log.ip !== '-' && !knownIps.has(log.ip)) {
        knownIps.add(log.ip)
        newIps += 1
      }
    }

    if (requests === 0) return
    pruneTrackedIds()

    const totalRequests = current.summary.totalRequests + requests
    const totalQuota = current.summary.totalQuota + quota
    const totalTokens = current.summary.totalTokens + promptTokens + completionTokens
    const activeIps = current.summary.activeIps + newIps

    overview.value = {
      ...current,
      summary: {
        ...current.summary,
        totalRequests,
        successRequests: current.summary.successRequests + successes,
        failedRequests: current.summary.failedRequests + failures,
        successRate: totalRequests > 0 ? Number(((current.summary.successRequests + successes) / totalRequests * 100).toFixed(2)) : 100,
        totalQuota,
        totalCostUsd: Number((totalQuota / QUOTA_PER_USD).toFixed(4)),
        promptTokens: current.summary.promptTokens + promptTokens,
        completionTokens: current.summary.completionTokens + completionTokens,
        totalTokens,
        activeIps,
        avgReqPerIp: activeIps > 0 ? Math.round(totalRequests / activeIps) : 0,
        avgCostPerIp: activeIps > 0 ? Number((totalQuota / QUOTA_PER_USD / activeIps).toFixed(2)) : 0,
        maxLogId: Math.max(current.summary.maxLogId, ...logs.map((log) => log.id)),
      },
    }
  }

  function pruneTrackedIds(): void {
    if (processedIds.size <= MAX_TRACKED_IDS) return
    const keep = Array.from(processedIds).slice(-KEEP_IDS)
    processedIds.clear()
    for (const id of keep) processedIds.add(id)
  }

  // ---------------------------------------------------------------- 取数

  async function loadData(silent = false): Promise<void> {
    if (silent) refreshing.value = true
    else loading.value = true

    try {
      const data = await analyticsApi.overview(currentRange.value)
      commit(data, { keepMonotonic: silent })
    } catch (err) {
      if (!silent) toast.error(errorMessage(err))
    } finally {
      loading.value = false
      refreshing.value = false
    }
  }

  function selectRange(key: TimeRangeKey): void {
    if (key === currentRange.value) return
    currentRange.value = key
    void loadData()
  }

  // 实时流水在推送到达时累加，与全量校准交替更新同一份状态
  // watch 注册在组件 effect scope 内，随组件卸载自动停止，无需手动释放
  watch(realtimeLogs, (logs) => applyRealtimeLogs(logs))

  useAutoRefresh(() => loadData(true), {
    intervalMs: (session.calibrationIntervalSec || 60) * 1000,
    onManualRefresh: () => loadData(false),
  })

  void loadData()

  return {
    overview,
    pulseMetrics: pulse,
    realtimeLogs,
    currentRange,
    loading,
    refreshing,
    selectRange,
    loadData,
  }
}

/** 静默校准期间保留实时累加出的更大值，避免数字回退 */
function applyMonotonic(current: OverviewMetrics, incoming: OverviewMetrics): void {
  for (const key of MONOTONIC_KEYS) {
    const previous = Number(current.summary[key] ?? 0)
    if (previous > Number(incoming.summary[key] ?? 0)) {
      incoming.summary[key] = previous
    }
  }
  incoming.summary.totalCostUsd = Number((incoming.summary.totalQuota / QUOTA_PER_USD).toFixed(4))
}
