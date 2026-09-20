export const TIME_RANGE_KEYS = ['today', '1h', '6h', '24h', '3d', '7d', '30d', 'all'] as const

export type TimeRangeKey = (typeof TIME_RANGE_KEYS)[number]

export interface TimeRangeFilter {
  key: TimeRangeKey
  startTime: number
  endTime: number
  label: string
}

const SHANGHAI_OFFSET = '+08:00'
const DAY_SEC = 86400

const RANGE_META: Record<TimeRangeKey, { label: string; durationSec: number }> = {
  today: { label: '今天 (0点起)', durationSec: 0 },
  '1h': { label: '过去 1 小时', durationSec: 3600 },
  '6h': { label: '过去 6 小时', durationSec: 6 * 3600 },
  '24h': { label: '过去 24 小时', durationSec: 24 * 3600 },
  '3d': { label: '过去 3 天', durationSec: 3 * DAY_SEC },
  '7d': { label: '过去 7 天', durationSec: 7 * DAY_SEC },
  '30d': { label: '过去 30 天', durationSec: 30 * DAY_SEC },
  all: { label: '全部历史', durationSec: 0 },
}

const isTimeRangeKey = (value: unknown): value is TimeRangeKey =>
  typeof value === 'string' && (TIME_RANGE_KEYS as readonly string[]).includes(value)

export function normalizeTimeRange(value: unknown, fallback: TimeRangeKey = 'today'): TimeRangeKey {
  return isTimeRangeKey(value) ? value : fallback
}

/** 东八区当天 00:00:00 的秒级时间戳 */
function shanghaiTodayStart(now: Date): number {
  const dateStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
  return Math.floor(new Date(`${dateStr}T00:00:00${SHANGHAI_OFFSET}`).getTime() / 1000)
}

export function parseTimeRange(key: string | undefined, now = new Date()): TimeRangeFilter {
  const rangeKey = normalizeTimeRange(key)
  const nowSec = Math.floor(now.getTime() / 1000)
  const meta = RANGE_META[rangeKey]

  if (rangeKey === 'all') {
    return { key: rangeKey, startTime: 0, endTime: nowSec, label: meta.label }
  }
  if (rangeKey === 'today') {
    return { key: rangeKey, startTime: shanghaiTodayStart(now), endTime: nowSec, label: meta.label }
  }
  return { key: rangeKey, startTime: nowSec - meta.durationSec, endTime: nowSec, label: meta.label }
}

/** 长期区间按天聚合，短期按小时聚合 */
export function trendGranularity(key: TimeRangeKey): 'day' | 'hour' {
  return key === '3d' || key === '7d' || key === '30d' || key === 'all' ? 'day' : 'hour'
}
