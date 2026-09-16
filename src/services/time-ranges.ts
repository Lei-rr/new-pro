import type { TimeRangeKey, TimeRangeFilter } from '../types/index.js'

export type { TimeRangeKey, TimeRangeFilter }

/**
 * 解析时间范围，返回基于秒级 Unix 时间戳的闭区间过滤器
 */
export function parseTimeRange(key: string = 'today'): TimeRangeFilter {
  const nowSec = Math.floor(Date.now() / 1000)

  // 计算东八区 (Asia/Shanghai) 当天 00:00:00 秒级时间戳
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  // en-CA 格式直接输出 YYYY-MM-DD
  const dateStr = formatter.format(new Date())
  const todayStart = Math.floor(new Date(`${dateStr}T00:00:00+08:00`).getTime() / 1000)

  switch (key as TimeRangeKey) {
    case '1h':
      return { key: '1h', startTime: nowSec - 3600, endTime: nowSec, label: '过去 1 小时' }
    case '6h':
      return { key: '6h', startTime: nowSec - 6 * 3600, endTime: nowSec, label: '过去 6 小时' }
    case '24h':
      return { key: '24h', startTime: nowSec - 24 * 3600, endTime: nowSec, label: '过去 24 小时' }
    case '3d':
      return { key: '3d', startTime: nowSec - 3 * 86400, endTime: nowSec, label: '过去 3 天' }
    case '7d':
      return { key: '7d', startTime: nowSec - 7 * 86400, endTime: nowSec, label: '过去 7 天' }
    case '30d':
      return { key: '30d', startTime: nowSec - 30 * 86400, endTime: nowSec, label: '过去 30 天' }
    case 'all':
      return { key: 'all', startTime: 0, endTime: nowSec, label: '全部历史' }
    case 'today':
    default:
      return { key: 'today', startTime: todayStart, endTime: nowSec, label: '今天 (0点起)' }
  }
}
