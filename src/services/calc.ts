/**
 * NewAPI 配额转换与指标通用计算
 */

export const NEWAPI_QUOTA_PER_USD = 500000

/**
 * 转换 NewAPI 整数配额为美金金额 (4位小数)
 */
export function quotaToUsd(quota: number): number {
  if (!quota || quota <= 0) return 0
  return Number((quota / NEWAPI_QUOTA_PER_USD).toFixed(4))
}

/**
 * 计算成功率百分比 (2位小数)
 */
export function calcRate(numerator: number, denominator: number, precision: number = 2): number {
  if (!denominator || denominator <= 0) return 100
  return Number(((numerator / denominator) * 100).toFixed(precision))
}
