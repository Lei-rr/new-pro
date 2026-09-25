export interface RiskRules {
  /** 纳入风险扫描的 IP 最小请求量 */
  ipMinRequests: number
  /** 单分钟请求达到该值判定为疑似中转/爬虫 */
  relayPerMinute: number
  /** 5 分钟内请求达到该值判定为疑似中转/爬虫 */
  relayBurst5m: number
  /** 5 分钟窗口内触发恶意刷量的最小请求数 */
  brushingBurst5m: number
  /** 5 分钟窗口恶意刷量失败率阈值(%) */
  brushingBurst5mFailRate: number
  /** 1 分钟窗口内触发恶意刷量的最小请求数 */
  brushingBurst1m: number
  /** 1 分钟窗口恶意刷量失败率阈值(%) */
  brushingBurst1mFailRate: number
  /** 统计周期内单 IP 天量请求阈值 */
  massiveVolume: number
  /** 累计请求达到该值且失败率高，判定为持续刷接口 */
  bruteForceTotal: number
  /** 持续刷接口失败率阈值(%) */
  bruteForceFailRate: number
  /** 持续刷接口的失败次数兜底阈值：失败数达标且失败率过半同样成立 */
  bruteForceFailedFloor: number
  /** 失败次数兜底路径要求的失败率阈值(%) */
  bruteForceFailRateLow: number
  /** IP 风险升级为 critical 的统一失败率阈值(%) */
  ipCriticalFailRate: number
  /** 中转/爬虫升级为 critical 的分钟级请求阈值 */
  relayCriticalPerMinute: number
  /** 天量调用升级为 critical 的倍率（相对 massiveVolume） */
  massiveVolumeCriticalFactor: number
  /** 渠道故障判定最小请求数 */
  channelMinRequests: number
  /** 渠道故障失败率阈值(%) */
  channelFailRate: number
  /** 渠道严重故障失败率阈值(%) */
  channelCriticalFailRate: number
  /** 渠道高延迟判定阈值(毫秒) */
  channelHighLatencyMs: number
  /** 渠道高延迟规则同时要求的失败率阈值(%) */
  channelHighLatencyFailRate: number
  /** 极端超时单次耗时阈值(毫秒) */
  extremeSlowMs: number
  /** 极端超时告警条数阈值 */
  extremeSlowAlertCount: number
}

export interface AppConfig {
  env: 'development' | 'production' | 'test'
  host: string
  port: number
  pgDsn: string
  dbPoolMax: number
  dbStatementTimeoutMs: number
  shutdownTimeoutMs: number
  slowQueryWarnMs: number
  sessionSecret: string
  sessionTtlSec: number
  cookieSecure: boolean
  adminUsername: string
  adminPassword: string
  logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent'
  trustProxy: boolean
  corsOrigins: string[]
  rateLimitMax: number
  rateLimitWindow: string
  loginRateLimitMax: number
  pulseIntervalSec: number
  calibrationIntervalSec: number
  overviewCacheTtlMs: number
  /** 长期区间的缓存时长：查询代价随区间线性增长，按更长 TTL 摊薄 */
  overviewLongCacheTtlMs: number
  riskCacheTtlMs: number
  dimensionCacheTtlMs: number
  /** 概览返回给前端的已知 IP 上限，防止长期区间响应体积膨胀 */
  knownIpListLimit: number
  geoLookupTimeoutMs: number
  geoOfflineEnabled: boolean
  geoOnlineEnabled: boolean
  /** 在线查询每日上限，0 表示不限制；防止第三方免费接口被风控全量扫描打爆 */
  geoOnlineDailyQuota: number
  geoCacheTtlMs: number
  geoNegativeCacheTtlMs: number
  internalIpList: string[]
  /** Prometheus 指标端点访问令牌；设置后需携带 Bearer，留空则仅允许内网访问 */
  metricsToken: string
  risk: RiskRules
}

const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const

function readString(name: string, fallback: string): string {
  const value = process.env[name]?.trim()
  return value ? value : fallback
}

function readInt(name: string, fallback: number, min: number, max: number): number {
  const raw = Number(process.env[name])
  if (!Number.isFinite(raw)) return fallback
  return Math.min(Math.max(Math.trunc(raw), min), max)
}

function readBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase()
  if (raw === undefined || raw === '') return fallback
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on'
}

function readList(name: string): string[] {
  return (process.env[name] || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function buildConfig(): AppConfig {
  const env = (readString('NODE_ENV', 'development') as AppConfig['env']) || 'development'
  const logLevelRaw = readString('LOG_LEVEL', 'info').toLowerCase()
  const logLevel = (LOG_LEVELS as readonly string[]).includes(logLevelRaw)
    ? (logLevelRaw as AppConfig['logLevel'])
    : 'info'

  return {
    env,
    host: readString('HOST', '0.0.0.0'),
    port: readInt('PORT', 3001, 1, 65535),
    pgDsn: readString('DATABASE_URL', readString('PG_DSN', '')),
    dbPoolMax: readInt('DB_POOL_MAX', 20, 1, 200),
    dbStatementTimeoutMs: readInt('DB_STATEMENT_TIMEOUT_MS', 15000, 1000, 300000),
    shutdownTimeoutMs: readInt('SHUTDOWN_TIMEOUT_MS', 10000, 1000, 60000),
    slowQueryWarnMs: readInt('SLOW_QUERY_WARN_MS', 2000, 100, 60000),
    sessionSecret: readString('JWT_SECRET', 'new-pro-dev-insecure-secret-change-me'),
    sessionTtlSec: readInt('SESSION_TTL_SEC', 7 * 86400, 300, 90 * 86400),
    cookieSecure: readBool('COOKIE_SECURE', false),
    adminUsername: readString('ADMIN_USERNAME', readString('ADMIN_USER', 'admin')),
    adminPassword: readString('ADMIN_PASSWORD', readString('ADMIN_PASS', 'admin123')),
    logLevel,
    trustProxy: readBool('TRUST_PROXY', false),
    corsOrigins: readList('CORS_ORIGINS'),
    rateLimitMax: readInt('RATE_LIMIT_MAX', 600, 30, 100000),
    rateLimitWindow: readString('RATE_LIMIT_WINDOW', '1 minute'),
    loginRateLimitMax: readInt('LOGIN_RATE_LIMIT_MAX', 10, 3, 1000),
    pulseIntervalSec: readInt('PULSE_INTERVAL_SEC', 3, 1, 60),
    calibrationIntervalSec: readInt('CALIBRATION_INTERVAL_SEC', 60, 5, 3600),
    overviewCacheTtlMs: readInt('OVERVIEW_CACHE_TTL_MS', 4000, 0, 60000),
    overviewLongCacheTtlMs: readInt('OVERVIEW_LONG_CACHE_TTL_MS', 60000, 0, 600000),
    riskCacheTtlMs: readInt('RISK_CACHE_TTL_MS', 5000, 0, 60000),
    dimensionCacheTtlMs: readInt('DIMENSION_CACHE_TTL_MS', 4000, 0, 60000),
    knownIpListLimit: readInt('KNOWN_IP_LIST_LIMIT', 2000, 100, 50000),
    geoLookupTimeoutMs: readInt('GEO_LOOKUP_TIMEOUT_MS', 1800, 200, 10000),
    geoOfflineEnabled: readBool('GEO_OFFLINE_ENABLED', true),
    geoOnlineEnabled: readBool('GEO_ONLINE_ENABLED', true),
    geoOnlineDailyQuota: readInt('GEO_ONLINE_DAILY_QUOTA', 2000, 0, 1000000),
    geoCacheTtlMs: readInt('GEO_CACHE_TTL_MS', 7 * 86400000, 60000, 90 * 86400000),
    geoNegativeCacheTtlMs: readInt('GEO_NEGATIVE_CACHE_TTL_MS', 3600000, 60000, 86400000),
    internalIpList: readList('INTERNAL_IP_LIST'),
    metricsToken: readString('METRICS_TOKEN', ''),
    risk: {
      ipMinRequests: readInt('RISK_IP_MIN_REQUESTS', 20, 1, 100000),
      relayPerMinute: readInt('RISK_RELAY_PER_MINUTE', 60, 5, 100000),
      relayBurst5m: readInt('RISK_RELAY_BURST_5M', 200, 10, 1000000),
      brushingBurst5m: readInt('RISK_BRUSHING_BURST_5M', 30, 5, 100000),
      brushingBurst5mFailRate: readInt('RISK_BRUSHING_BURST_5M_FAIL_RATE', 70, 1, 100),
      brushingBurst1m: readInt('RISK_BRUSHING_BURST_1M', 20, 5, 100000),
      brushingBurst1mFailRate: readInt('RISK_BRUSHING_BURST_1M_FAIL_RATE', 75, 1, 100),
      massiveVolume: readInt('RISK_MASSIVE_VOLUME', 5000, 100, 100000000),
      bruteForceTotal: readInt('RISK_BRUTE_FORCE_TOTAL', 200, 10, 10000000),
      bruteForceFailRate: readInt('RISK_BRUTE_FORCE_FAIL_RATE', 70, 1, 100),
      bruteForceFailedFloor: readInt('RISK_BRUTE_FORCE_FAILED_FLOOR', 150, 10, 10000000),
      bruteForceFailRateLow: readInt('RISK_BRUTE_FORCE_FAIL_RATE_LOW', 60, 1, 100),
      ipCriticalFailRate: readInt('RISK_IP_CRITICAL_FAIL_RATE', 85, 1, 100),
      relayCriticalPerMinute: readInt('RISK_RELAY_CRITICAL_PER_MINUTE', 90, 10, 100000),
      massiveVolumeCriticalFactor: readInt('RISK_MASSIVE_VOLUME_CRITICAL_FACTOR', 2, 1, 100),
      channelMinRequests: readInt('RISK_CHANNEL_MIN_REQUESTS', 30, 5, 1000000),
      channelFailRate: readInt('RISK_CHANNEL_FAIL_RATE', 50, 1, 100),
      channelCriticalFailRate: readInt('RISK_CHANNEL_CRITICAL_FAIL_RATE', 80, 1, 100),
      channelHighLatencyMs: readInt('RISK_CHANNEL_HIGH_LATENCY_MS', 15000, 1000, 600000),
      channelHighLatencyFailRate: readInt('RISK_CHANNEL_HIGH_LATENCY_FAIL_RATE', 30, 1, 100),
      extremeSlowMs: readInt('RISK_EXTREME_SLOW_MS', 45000, 1000, 600000),
      extremeSlowAlertCount: readInt('RISK_EXTREME_SLOW_COUNT', 50, 1, 1000000),
    },
  }
}

let cached: AppConfig | null = null

export function getConfig(): AppConfig {
  if (!cached) cached = buildConfig()
  return cached
}

/** 启动期配置体检：仅告警不阻断，避免破坏既有部署 */
export function auditConfig(config: AppConfig): string[] {
  const warnings: string[] = []
  if (!config.pgDsn) warnings.push('DATABASE_URL 未配置，服务无法读取 NewAPI 数据')
  if (config.env === 'production') {
    if (config.sessionSecret.startsWith('new-pro-dev-insecure')) {
      warnings.push('JWT_SECRET 仍为内置默认值，请更换为随机密钥')
    }
    if (config.adminPassword === 'admin123') {
      warnings.push('ADMIN_PASSWORD 仍为默认密码，存在被爆破风险')
    }
  }
  if (config.corsOrigins.length === 0 && config.env === 'development') {
    warnings.push('CORS_ORIGINS 未配置，跨域请求将被拒绝（同源与反向代理部署可忽略）')
  }
  return warnings
}
