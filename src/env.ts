import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().default(3600),
  HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  LOG_DIR: z.string().default('/guolei/new-api/logs'),
  LOG_PATTERN: z.string().default('oneapi-*.log'),

  // Auth: comma-separated API keys. Empty = auth disabled.
  API_KEYS: z.string().default(''),

  MAX_ENTRIES: z.coerce.number().default(500_000),
  RETENTION_HOURS: z.coerce.number().default(72),

  WS_STATS_INTERVAL_MS: z.coerce.number().default(3000),
  WS_LOGS_BATCH_MS: z.coerce.number().default(200),
  WS_LOGS_BATCH_SIZE: z.coerce.number().default(20),

  ALERT_IP_RATE_PER_MIN: z.coerce.number().default(100),
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
