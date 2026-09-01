import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().default(3600),
  HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // PostgreSQL: NewAPI 数据库（唯一数据源）
  SQL_DSN: z.string().default(''),
  // 业务时区（自然日窗口对齐用，默认容器本地时区）
  LOG_TZ: z
    .string()
    .default('local')
    .refine((tz) => {
      if (tz === 'local') return true;
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    }, 'LOG_TZ must be "local" or a valid IANA timezone'),
  // 实时增量轮询间隔（ms）
  POLL_INTERVAL_MS: z.coerce.number().int().min(500).default(1000),
  // 统计广播间隔（ms）
  WS_STATS_INTERVAL_MS: z.coerce.number().int().min(1000).default(3000),
  // 维度/日志查询的默认时间窗口（自然日）
  DEFAULT_RANGE_DAYS: z.coerce.number().int().min(1).max(90).default(7),

  // Auth: comma-separated API keys. Empty = auth disabled.
  API_KEYS: z.string().default(''),

  // CORS: comma-separated allowed origins. Empty = same-origin only.
  CORS_ORIGINS: z.string().default(''),

  // Per-IP HTTP rate limit: max requests per window (0 = disabled).
  RATE_LIMIT_MAX: z.coerce.number().int().min(0).default(600),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(60_000),

  // 告警阈值
  ALERT_ERROR_RATE: z.coerce.number().default(0.1),
  ALERT_QUOTA_THRESHOLD: z.coerce.number().default(50_000_000),
});

export type Env = z.infer<typeof envSchema>;

let _env: Env | null = null;

export function getEnv(): Env {
  if (!_env) {
    const result = envSchema.safeParse(process.env);
    if (!result.success) {
      console.error('Invalid environment variables:', result.error.flatten().fieldErrors);
      process.exit(1);
    }
    _env = result.data;
  }
  return _env;
}
