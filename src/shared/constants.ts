/** NewAPI logs 表业务类型（type 列） */
export const LogType = {
  Consume: 2,
  System: 3,
  Error: 5,
  Auth: 7,
} as const;

export type LogTypeValue = (typeof LogType)[keyof typeof LogType];

/** 前端日志流 kind → LogType 集合 */
export const KIND_TO_TYPES: Record<string, number[]> = {
  all: [LogType.Consume, LogType.System, LogType.Error, LogType.Auth],
  consume: [LogType.Consume],
  error: [LogType.Error],
  sys: [LogType.System, LogType.Auth],
  success: [LogType.Consume],
  failure: [LogType.Error],
};

/** Quota → 成本（NewAPI 默认 500,000 = 1） */
export const QUOTA_PER_COST_UNIT = 500_000;

/** 维度 key → logs 表列名 */
export const DIMENSION_COLUMNS: Record<string, string> = {
  model: 'model_name',
  channel: 'channel_id::text',
  token: 'token_name',
  user: 'user_id::text',
  group: '"group"',
};

/** 维度排序 key → SQL 聚合别名 */
export const DIMENSION_SORT_COLUMNS: Record<string, string> = {
  requests: 'requests',
  tokens: 'total_tokens',
  quota: 'quota',
  cost: 'quota',
};

/** 时间线步长（按窗口长度选择） */
export function timelineStep(days: number): number {
  if (days <= 2) return 3600;
  if (days <= 7) return 7200;
  if (days <= 30) return 21_600;
  return 43_200;
}
