/** NewAPI 额度换算常量：1 USD = 500,000 quota */
export const QUOTA_PER_USD = 500_000

export function quotaToUsd(quota: number): number {
  if (!Number.isFinite(quota) || quota <= 0) return 0
  return round(quota / QUOTA_PER_USD, 4)
}

/** 计算百分比；分母无效时返回 100（表示无失败样本） */
export function calcRate(numerator: number, denominator: number, precision = 2): number {
  if (!denominator || denominator <= 0) return 100
  return round((numerator / denominator) * 100, precision)
}

export function round(value: number, precision = 2): number {
  if (!Number.isFinite(value)) return 0
  const factor = 10 ** precision
  return Math.round(value * factor) / factor
}

/** 统一将 pg 返回值转为有限数字，规避 numeric/bigint 字符串与 null */
export function toNumber(value: unknown, fallback = 0): number {
  if (value === null || value === undefined) return fallback
  const num = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(num) ? num : fallback
}

export function formatShanghaiTime(epochSec: number): string {
  return new Date(epochSec * 1000).toLocaleTimeString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    hour12: false,
  })
}
