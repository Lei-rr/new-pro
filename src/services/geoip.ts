import IP2Region from 'ip2region'
import { getConfig } from '../config.js'
import { createLogger } from '../core/logger.js'
import { isPrivateIp } from '../shared/ip.js'

const log = createLogger('geoip')

const UNKNOWN_LOCATIONS = new Set(['', '-', '未知', '未知IP'])
const CACHE_MAX = 20000
const ONLINE_CONCURRENCY = 4
const FALLBACK_LOCATION = '互联网地址'

/**
 * 国家/地区名归一化。
 * 各源对同一地区可能返回英文全称或本地化名称，
 * 不统一会导致同一地区在界面上出现两种写法。
 */
const COUNTRY_ALIASES: Record<string, string> = {
  'South Korea': '韩国',
  'Korea (the Republic of)': '韩国',
  'Republic of Korea': '韩国',
  'United States': '美国',
  'United States of America': '美国',
  'Russian Federation': '俄罗斯',
  'Viet Nam': '越南',
  Singapore: '新加坡',
  Japan: '日本',
  China: '中国',
  'Hong Kong': '中国 · 香港',
  Taiwan: '中国 · 台湾',
  Germany: '德国',
  France: '法国',
  'United Kingdom': '英国',
  Netherlands: '荷兰',
  Canada: '加拿大',
  Australia: '澳大利亚',
  Russia: '俄罗斯',
  Ukraine: '乌克兰',
  India: '印度',
  Malaysia: '马来西亚',
  Thailand: '泰国',
  Vietnam: '越南',
  Indonesia: '印度尼西亚',
  Philippines: '菲律宾',
}

interface GeoProvider {
  name: string
  buildUrl: (ip: string) => string
  pick: (data: Record<string, any>) => string[]
}

interface CacheEntry {
  location: string
  expiresAt: number
}

/**
 * 在线归属地数据源池，按顺序故障转移。
 * 任一源不可用（限流/下线/超时）自动切换下一个；
 * 连续失败的源会被临时熔断，避免每次查询都浪费一次超时等待。
 */
const PROVIDERS: GeoProvider[] = [
  {
    name: 'ip-api',
    buildUrl: (ip) => `http://ip-api.com/json/${encodeURIComponent(ip)}?lang=zh-CN`,
    pick: (data) =>
      data?.status === 'success' ? [data.country, data.regionName, data.city, data.isp] : [],
  },
  {
    name: 'ipwho',
    buildUrl: (ip) => `https://ipwho.is/${encodeURIComponent(ip)}?lang=zh-CN`,
    pick: (data) =>
      data?.success ? [data.country, data.region, data.city, data.connection?.isp] : [],
  },
  {
    name: 'ip2location',
    buildUrl: (ip) => `https://api.ip2location.io/?ip=${encodeURIComponent(ip)}`,
    pick: (data) =>
      data?.country_name || data?.country_code
        ? [data.country_name || data.country_code, data.region_name, data.city_name, data.as]
        : [],
  },
  {
    name: 'ipwhois.app',
    buildUrl: (ip) => `https://ipwhois.app/json/${encodeURIComponent(ip)}`,
    pick: (data) =>
      data?.success ? [data.country, data.region, data.city, data.isp || data.org] : [],
  },
]

/** 单个源连续失败达到该次数后熔断 */
const PROVIDER_FAILURE_THRESHOLD = 3
/** 熔断后的静默期，期满重新尝试该源 */
const PROVIDER_COOLDOWN_MS = 5 * 60 * 1000

interface ProviderState {
  consecutiveFailures: number
  blockedUntil: number
}

const providerStates = new Map<string, ProviderState>()

function isProviderAvailable(name: string): boolean {
  const state = providerStates.get(name)
  if (!state) return true
  return Date.now() >= state.blockedUntil
}

function recordProviderResult(name: string, ok: boolean): void {
  const state = providerStates.get(name) ?? { consecutiveFailures: 0, blockedUntil: 0 }

  if (ok) {
    state.consecutiveFailures = 0
    state.blockedUntil = 0
  } else {
    state.consecutiveFailures += 1
    if (state.consecutiveFailures >= PROVIDER_FAILURE_THRESHOLD) {
      state.blockedUntil = Date.now() + PROVIDER_COOLDOWN_MS
      log.warn(
        { provider: name, failures: state.consecutiveFailures, cooldownMs: PROVIDER_COOLDOWN_MS },
        'geo provider temporarily disabled'
      )
    }
  }
  providerStates.set(name, state)
}

export function getGeoProviderStatus(): Array<{ name: string; available: boolean; failures: number }> {
  return PROVIDERS.map((provider) => {
    const state = providerStates.get(provider.name)
    return {
      name: provider.name,
      available: isProviderAvailable(provider.name),
      failures: state?.consecutiveFailures ?? 0,
    }
  })
}

const cache = new Map<string, CacheEntry>()
const inflight = new Map<string, Promise<string>>()

let offlineEngine: { search: (ip: string) => any } | null = null
if (getConfig().geoOfflineEnabled) {
  try {
    const Ctor = (IP2Region as any)?.default ?? IP2Region
    offlineEngine = new Ctor()
  } catch (err) {
    log.warn({ err }, 'ip2region 离线库初始化失败，将仅使用在线查询')
  }
}

// ---------------------------------------------------------------- 在线配额

let quotaDay = currentDay()
let onlineUsedToday = 0

function currentDay(): string {
  return new Date().toISOString().slice(0, 10)
}

function consumeOnlineQuota(): boolean {
  const day = currentDay()
  if (day !== quotaDay) {
    quotaDay = day
    onlineUsedToday = 0
  }
  const limit = getConfig().geoOnlineDailyQuota
  if (limit > 0 && onlineUsedToday >= limit) return false
  onlineUsedToday += 1
  return true
}

export function getGeoStats(): {
  cacheSize: number
  inflight: number
  onlineUsedToday: number
  onlineDailyQuota: number
  offlineEngine: boolean
  providers: Array<{ name: string; available: boolean; failures: number }>
} {
  return {
    cacheSize: cache.size,
    inflight: inflight.size,
    onlineUsedToday,
    onlineDailyQuota: getConfig().geoOnlineDailyQuota,
    offlineEngine: offlineEngine !== null,
    providers: getGeoProviderStatus(),
  }
}

// ---------------------------------------------------------------- 并发闸门

let onlineSlots = ONLINE_CONCURRENCY
const waiters: Array<() => void> = []

async function acquireSlot(): Promise<void> {
  if (onlineSlots > 0) {
    onlineSlots -= 1
    return
  }
  await new Promise<void>((resolve) => waiters.push(resolve))
}

function releaseSlot(): void {
  const next = waiters.shift()
  if (next) next()
  else onlineSlots += 1
}

// ---------------------------------------------------------------- 查询实现

function joinParts(parts: Array<string | undefined>): string {
  const normalized = parts.map((part) => {
    if (!part || part === '0' || part === 'null') return undefined
    return COUNTRY_ALIASES[part] ?? part
  })
  const unique = Array.from(new Set(normalized.filter((p): p is string => !!p)))
  return unique.join(' · ')
}

interface OfflineResult {
  /** 格式化后的归属地文本，未命中为空串 */
  location: string
  /**
   * 是否达到高可信标准（省与市均有值）。
   *
   * 离线库对海外网段覆盖较弱，实测误判集中在「信息不完整」的记录：
   * - 43.128.0.0/16 腾讯云韩国节点仅有国家，被判为澳大利亚
   * - 45.205.28.22 仅有省(香港)无城市，实际路由在美国洛杉矶
   *
   * 省、市齐全时（如国内三大运营商）结果稳定准确，可直接采用；
   * 信息不完整时交在线源复核，失败再回退离线值。
   */
  highConfidence: boolean
}

function searchOffline(ip: string): OfflineResult {
  if (!offlineEngine) return { location: '', highConfidence: false }
  try {
    const res = offlineEngine.search(ip)
    if (!res) return { location: '', highConfidence: false }

    const filled = (value: unknown): boolean =>
      typeof value === 'string' && value !== '' && value !== '0'

    return {
      location: joinParts([res.country, res.province, res.city, res.isp]),
      highConfidence: filled(res.country) && filled(res.province) && filled(res.city),
    }
  } catch {
    return { location: '', highConfidence: false }
  }
}

async function queryProvider(provider: GeoProvider, ip: string): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), getConfig().geoLookupTimeoutMs)
  try {
    const res = await fetch(provider.buildUrl(ip), { signal: controller.signal })
    if (!res.ok) return ''
    return joinParts(provider.pick((await res.json()) as Record<string, any>))
  } catch {
    return ''
  } finally {
    clearTimeout(timer)
  }
}

async function queryOnline(ip: string): Promise<string> {
  if (!getConfig().geoOnlineEnabled) return ''
  if (!consumeOnlineQuota()) return ''

  await acquireSlot()
  try {
    for (const provider of PROVIDERS) {
      if (!isProviderAvailable(provider.name)) continue

      const location = await queryProvider(provider, ip)
      recordProviderResult(provider.name, location !== '')
      if (location) return location
    }
    return ''
  } finally {
    releaseSlot()
  }
}

/** 距上次清理的插入计数，避免用 size 取模判定（容量满时会永久为真） */
let insertsSinceSweep = 0
const SWEEP_INTERVAL = 500

function remember(ip: string, location: string, ttlMs: number): void {
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value
    if (oldest !== undefined) cache.delete(oldest)
  }
  cache.set(ip, { location, expiresAt: Date.now() + ttlMs })

  // 按插入次数周期性清理过期项，而非按 size 取模：
  // 容量达到上限后 size 恒等于 CACHE_MAX，取模条件会一直成立并导致每次插入都全量遍历
  if (++insertsSinceSweep < SWEEP_INTERVAL) return
  insertsSinceSweep = 0

  const now = Date.now()
  for (const [key, entry] of cache) {
    if (entry.expiresAt <= now) cache.delete(key)
  }
}

/**
 * IP 归属地查询策略：内存缓存 → 本地 ip2region → 在线多源复核/降级。
 *
 * 离线库命中省市信息时直接采用（国内 IP 准确且零延迟）；
 * 仅给出国家粒度时结果不可靠，交由在线源复核，失败则回退离线值。
 * 在线查询受每日配额与并发数双重约束，失败结果按较短 TTL 缓存。
 */
export async function getIpLocation(ip: string): Promise<string> {
  const cleanIp = ip.trim()
  if (UNKNOWN_LOCATIONS.has(cleanIp)) return '未知位置'
  if (isPrivateIp(cleanIp)) return '内网/局域网'

  const cached = cache.get(cleanIp)
  if (cached) {
    if (cached.expiresAt > Date.now()) return cached.location
    cache.delete(cleanIp)
  }

  const running = inflight.get(cleanIp)
  if (running) return running

  const task = (async () => {
    const offline = searchOffline(cleanIp)

    // 省市齐全：离线结果可信，直接采用（国内 IP 零延迟）
    if (offline.location && offline.highConfidence) {
      remember(cleanIp, offline.location, getConfig().geoCacheTtlMs)
      return offline.location
    }

    // 信息不完整或未命中：以在线结果为准，失败时回退离线值
    const online = await queryOnline(cleanIp)
    if (online) {
      remember(cleanIp, online, getConfig().geoCacheTtlMs)
      return online
    }

    if (offline.location) {
      remember(cleanIp, offline.location, getConfig().geoNegativeCacheTtlMs)
      return offline.location
    }

    remember(cleanIp, FALLBACK_LOCATION, getConfig().geoNegativeCacheTtlMs)
    return FALLBACK_LOCATION
  })().finally(() => {
    inflight.delete(cleanIp)
  })

  inflight.set(cleanIp, task)
  return task
}

/** 批量并发补全归属地，结果按 IP 索引 */
export async function resolveIpLocations(ips: Iterable<string>): Promise<Map<string, string>> {
  const unique = Array.from(new Set(Array.from(ips).filter((ip) => !UNKNOWN_LOCATIONS.has(ip))))
  const entries = await Promise.all(
    unique.map(async (ip): Promise<[string, string]> => [ip, await getIpLocation(ip)])
  )
  return new Map(entries)
}
