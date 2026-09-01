import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().default(3600),
  HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // PostgreSQL（NewAPI 生产库，只读）
  SQL_DSN: z.string().default(''),

  // 业务时区（自然日窗口对齐）
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

  // 实时增量轮询（仅日志流）
  POLL_INTERVAL_MS: z.coerce.number().int().min(500).default(1000),
  // 默认查询窗口（自然日）
  DEFAULT_RANGE_DAYS: z.coerce.number().int().min(1).max(90).default(7),

  // Auth
  API_KEYS: z.string().default(''),

  // CORS / 限流
  CORS_ORIGINS: z.string().default(''),
  RATE_LIMIT_MAX: z.coerce.number().int().min(0).default(600),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(60_000),

  // 告警阈值
  ALERT_ERROR_RATE: z.coerce.number().default(0.3),
  ALERT_QUOTA_THRESHOLD: z.coerce.number().default(50_000_000),
});

export type Config = z.infer<typeof envSchema>;

let cached: Config | null = null;

/** 加载并缓存配置；启动时调用一次，之后所有模块共享只读实例 */
export function loadConfig(): Config {
  if (!cached) {
    const result = envSchema.safeParse(process.env);
    if (!result.success) {
      console.error('Invalid environment variables:', result.error.flatten().fieldErrors);
      process.exit(1);
    }
    cached = result.data;
  }
  return cached;
}
