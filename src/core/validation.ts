/** 解析并夹取整型查询参数，非法输入回落默认值 */
export function parseIntClamped(value: unknown, fallback: number, min: number, max: number): number {
  const raw = Number(value)
  if (!Number.isFinite(raw)) return fallback
  return Math.min(Math.max(Math.trunc(raw), min), max)
}
