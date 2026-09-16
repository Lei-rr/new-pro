export interface TimeRangeOption {
  key: string
  label: string
}

export const TIME_RANGES: TimeRangeOption[] = [
  { key: 'today', label: '今天(0点)' },
  { key: '1h', label: '1小时' },
  { key: '6h', label: '6小时' },
  { key: '24h', label: '24小时' },
  { key: '3d', label: '3天内' },
  { key: '7d', label: '7天内' },
  { key: '30d', label: '30天内' },
  { key: 'all', label: '全部' },
]

export const RISK_TIME_RANGES: TimeRangeOption[] = [
  { key: 'today', label: '今天(0点)' },
  { key: '1h', label: '1小时' },
  { key: '6h', label: '6小时' },
  { key: '24h', label: '24小时' },
  { key: '3d', label: '3天内' },
  { key: '7d', label: '7天内' },
]
