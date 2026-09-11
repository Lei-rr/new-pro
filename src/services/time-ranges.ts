export type TimeRangeKey = 'today' | '1h' | '6h' | '24h' | '3d' | '7d' | '30d' | 'all'

export interface TimeRangeFilter {
  key: TimeRangeKey
  startTime: number // unix epoch in seconds, 0 means all
  endTime: number   // unix epoch in seconds
  label: string
}

export function parseTimeRange(key: string = 'today'): TimeRangeFilter {
  const nowSec = Math.floor(Date.now() / 1000)

  // 计算东八区（Asia/Shanghai）当天 00:00:00 的秒级时间戳
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const parts = formatter.formatToParts(new Date())
  const year = parts.find((p) => p.type === 'year')?.value
  const month = parts.find((p) => p.type === 'month')?.value
  const day = parts.find((p) => p.type === 'day')?.value
  const todayStart = Math.floor(new Date(`${year}-${month}-${day}T00:00:00+08:00`).getTime() / 1000)

  switch (key) {
    case '1h':
      return {
        key: '1h',
        startTime: nowSec - 3600,
        endTime: nowSec,
        label: '过去 1 小时',
      }
    case '6h':
      return {
        key: '6h',
        startTime: nowSec - 6 * 3600,
        endTime: nowSec,
        label: '过去 6 小时',
      }
    case '24h':
      return {
        key: '24h',
        startTime: nowSec - 24 * 3600,
        endTime: nowSec,
        label: '过去 24 小时',
      }
    case '3d':
      return {
        key: '3d',
        startTime: nowSec - 3 * 86400,
        endTime: nowSec,
        label: '过去 3 天',
      }
    case '7d':
      return {
        key: '7d',
        startTime: nowSec - 7 * 86400,
        endTime: nowSec,
        label: '过去 7 天',
      }
    case '30d':
      return {
        key: '30d',
        startTime: nowSec - 30 * 86400,
        endTime: nowSec,
        label: '过去 30 天',
      }
    case 'all':
      return {
        key: 'all',
        startTime: 0,
        endTime: nowSec,
        label: '全部历史',
      }
    case 'today':
    default:
      return {
        key: 'today',
        startTime: Math.floor(todayStart),
        endTime: nowSec,
        label: '今天 (0点起)',
      }
  }
}
