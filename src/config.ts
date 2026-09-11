export interface AppConfig {
  host: string
  port: number
  pgDsn: string
  jwtSecret: string
  adminUsername: string
  adminPasswordHash: string
  logLevel: string
  pulseIntervalSec: number
  calibrationIntervalSec: number
}

export function loadConfig(): AppConfig {
  return {
    host: process.env.HOST || '0.0.0.0',
    port: Number(process.env.PORT || 3033),
    pgDsn: process.env.DATABASE_URL || process.env.PG_DSN || 'postgresql://root:password@new-api-postgres:5432/new-api',
    jwtSecret: process.env.JWT_SECRET || 'new-pro-super-secret-key-32-chars-long-analysis',
    adminUsername: process.env.ADMIN_USER || 'admin',
    adminPasswordHash: process.env.ADMIN_PASS || 'admin123',
    logLevel: process.env.LOG_LEVEL || 'info',
    pulseIntervalSec: Math.max(1, Number(process.env.PULSE_INTERVAL_SEC || 5)),
    calibrationIntervalSec: Math.max(5, Number(process.env.CALIBRATION_INTERVAL_SEC || 60)),
  }
}
