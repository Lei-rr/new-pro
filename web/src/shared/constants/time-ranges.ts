import type { TimeRangeKey } from '@/shared/api/types'

export interface TimeRangeOption {
  key: TimeRangeKey
  label: string
}

const ALL_RANGES: TimeRangeOption[] = [
  { key: 'today', label: '今天(0点)' },
  { key: '1h', label: '1小时' },
  { key: '6h', label: '6小时' },
  { key: '24h', label: '24小时' },
  { key: '3d', label: '3天内' },
  { key: '7d', label: '7天内' },
  { key: '30d', label: '30天内' },
  { key: 'all', label: '全部' },
]

/** 大屏与多维分析支持完整区间 */
export const TIME_RANGES = ALL_RANGES

/** 风控扫描不提供全量历史，避免无界查询 */
export const RISK_TIME_RANGES = ALL_RANGES.filter((item) => item.key !== '30d' && item.key !== 'all')
