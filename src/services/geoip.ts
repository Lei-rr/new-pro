import IP2Region from 'ip2region'

// 1. 本地内存二级缓存 (IP -> 格式化后的地理位置中文)
const memoryGeoCache = new Map<string, string>()

// 2. 初始化离线 ip2region 引擎 (内置本地 xdb 二进制数据库，微秒级寻址)
let ip2regionInstance: any = null
try {
  const IP2RegionCls = (IP2Region as any)?.default || IP2Region
  ip2regionInstance = new IP2RegionCls()
} catch (err) {
  console.warn('[GeoIP] ip2region 本地离线引擎初始化失败，将降级全走在线 API:', err)
}

// 私有/内网与回环 IP 特判
function isPrivateIp(ip: string): boolean {
  if (!ip || ip === '-' || ip === '::1' || ip === 'localhost') return true
  if (ip === '127.0.0.1' || ip.startsWith('10.') || ip.startsWith('192.168.')) return true
  if (ip.startsWith('172.16.') || ip.startsWith('172.17.') || ip.startsWith('172.18.') ||
      ip.startsWith('172.19.') || ip.startsWith('172.20.') || ip.startsWith('172.21.') ||
      ip.startsWith('172.22.') || ip.startsWith('172.23.') || ip.startsWith('172.24.') ||
      ip.startsWith('172.25.') || ip.startsWith('172.26.') || ip.startsWith('172.27.') ||
      ip.startsWith('172.28.') || ip.startsWith('172.29.') || ip.startsWith('172.30.') || ip.startsWith('172.31.')) {
    return true
  }
  return false
}

// ========================================================
// 多重在线 API 故障自愈轮转池 (Provider Failover Strategy)
// ========================================================

async function queryIpApiCom(ip: string, signal: AbortSignal): Promise<string> {
  const res = await fetch(`http://ip-api.com/json/${encodeURIComponent(ip)}?lang=zh-CN`, { signal })
  if (!res.ok) return ''
  const data = (await res.json()) as any
  if (data && data.status === 'success') {
    const parts = [data.country, data.regionName, data.city, data.isp].filter(Boolean)
    const unique = Array.from(new Set(parts))
    return unique.join(' · ')
  }
  return ''
}

async function queryIpWhoIs(ip: string, signal: AbortSignal): Promise<string> {
  const res = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}?lang=zh-CN`, { signal })
  if (!res.ok) return ''
  const data = (await res.json()) as any
  if (data && data.success) {
    const parts = [data.country, data.region, data.city, data.connection?.isp].filter(Boolean)
    const unique = Array.from(new Set(parts))
    return unique.join(' · ')
  }
  return ''
}

async function queryIpSb(ip: string, signal: AbortSignal): Promise<string> {
  const res = await fetch(`https://api.ip.sb/geoip/${encodeURIComponent(ip)}`, { signal })
  if (!res.ok) return ''
  const data = (await res.json()) as any
  if (data && data.country) {
    const parts = [data.country, data.region, data.city, data.isp].filter(Boolean)
    const unique = Array.from(new Set(parts))
    return unique.join(' · ')
  }
  return ''
}

// 在线多通道自动轮询兜底
async function fetchOnlineGeoWithFailover(ip: string): Promise<string> {
  const providers = [queryIpApiCom, queryIpWhoIs, queryIpSb]

  for (const provider of providers) {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 1800)
      const loc = await provider(ip, controller.signal)
      clearTimeout(timeout)
      if (loc && loc !== '0') {
        return loc
      }
    } catch (_) {
      // 某个 API 失败或限频超时，自动尝试下一个 Provider
      continue
    }
  }

  return ''
}

/**
 * 核心对外查询函数：
 * 策略：
 * 1. 内存极速缓存 (0ms)
 * 2. 离线 ip2region 本地二进制库 (微秒级)
 * 3. 在线 API 故障自愈轮询 (ip-api.com -> ipwho.is -> ip.sb)
 */
export async function getIpLocation(ip: string): Promise<string> {
  if (!ip || ip === '-' || ip === '未知' || ip === '未知IP') return '未知位置'
  const cleanIp = ip.trim()

  // 1. 检查内网回环
  if (isPrivateIp(cleanIp)) {
    return '内网/局域网'
  }

  // 2. 检查内存快速缓存
  if (memoryGeoCache.has(cleanIp)) {
    return memoryGeoCache.get(cleanIp)!
  }

  let location = ''

  // 3. 路线 B 优先：离线 ip2region 微秒级本地寻址
  if (ip2regionInstance) {
    try {
      const res = ip2regionInstance.search(cleanIp)
      if (res && (res.country || res.province || res.city)) {
        const parts = [res.country, res.province, res.city, res.isp]
          .filter((p) => p && p !== '0' && p !== 'null')
        
        const uniqueParts = Array.from(new Set(parts))
        if (uniqueParts.length > 0) {
          location = uniqueParts.join(' · ')
        }
      }
    } catch (_) {}
  }

  // 4. 路线 A 降级：如果离线库查不到（或数据不充分），走多重在线 API 故障自愈轮转池
  if (!location || location === '0' || location === '中国') {
    const onlineRes = await fetchOnlineGeoWithFailover(cleanIp)
    if (onlineRes) {
      location = onlineRes
    }
  }

  const finalLocation = location || '互联网地址'

  // 写入内存缓存 (保持在 15,000 条以内防止堆积)
  if (memoryGeoCache.size > 20000) {
    const firstKey = memoryGeoCache.keys().next().value
    if (firstKey) memoryGeoCache.delete(firstKey)
  }
  memoryGeoCache.set(cleanIp, finalLocation)

  return finalLocation
}

/**
 * 批量获取 IP 归属地（并发查询）
 */
export async function batchGetIpLocations(ips: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>()
  if (!ips || !ips.length) return result

  const uniqueIps = Array.from(new Set(ips.filter((ip) => ip && ip !== '-' && ip !== '未知')))

  await Promise.all(
    uniqueIps.map(async (ip) => {
      const loc = await getIpLocation(ip)
      result.set(ip, loc)
    })
  )

  return result
}
