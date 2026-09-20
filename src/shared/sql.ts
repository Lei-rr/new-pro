interface SqlTimeScope {
  /** 占位符参数，顺序与 where / and 一致 */
  params: number[]
  /** 形如 `WHERE created_at >= $1 AND created_at <= $2`；全量区间返回空串 */
  where: string
  /** 形如 `AND created_at >= $1 AND created_at <= $2`；全量区间返回空串 */
  and: string
}

/**
 * 生成基于秒级时间戳的 SQL 条件片段。
 * - startTime <= 0 视为全量区间，避免产生无效谓词
 * - 支持传入列限定符（如 `l`）以适配 JOIN 查询
 */
export function buildTimeScope(startTime: number, endTime: number, column = 'created_at'): SqlTimeScope {
  if (!(startTime > 0)) return { params: [], where: '', and: '' }
  return {
    params: [startTime, endTime],
    where: `WHERE ${column} >= $1 AND ${column} <= $2`,
    and: `AND ${column} >= $1 AND ${column} <= $2`,
  }
}

/** 生成指定粒度的时间分桶表达式（用于趋势聚合） */
export function timeBucketExpr(granularity: 'hour' | 'day', column = 'created_at'): string {
  const format = granularity === 'day' ? 'YYYY-MM-DD' : 'YYYY-MM-DD HH24:00'
  return `to_char(timezone('Asia/Shanghai', to_timestamp(${column})), '${format}')`
}
