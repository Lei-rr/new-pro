import IP2Region from 'ip2region';

let queryInstance: IP2Region | null = null;
const cache = new Map<string, string>();

/**
 * High-performance offline IP geolocation lookup using ip2region (in-memory cached).
 */
export function getIpLocation(ip?: string | null): string {
  if (!ip || ip === '::1' || ip === '127.0.0.1' || ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.')) {
    return '本地/内网';
  }

  const cached = cache.get(ip);
  if (cached !== undefined) return cached;

  try {
    if (!queryInstance) {
      queryInstance = new IP2Region();
    }

    const res = queryInstance.search(ip);
    if (!res) {
      cache.set(ip, '未知');
      return '未知';
    }

    const parts: string[] = [];
    if (res.country && res.country !== '0') parts.push(res.country);
    if (res.province && res.province !== '0' && res.province !== res.country) {
      parts.push(res.province.replace('省', ''));
    }
    if (res.city && res.city !== '0' && res.city !== res.province && res.city !== res.country) {
      parts.push(res.city.replace('市', ''));
    }
    if (res.isp && res.isp !== '0' && !['内网IP', '未知'].includes(res.isp)) {
      parts.push(res.isp);
    }

    const loc = parts.length > 0 ? parts.join('·') : '未知';
    if (cache.size > 30_000) cache.clear();
    cache.set(ip, loc);
    return loc;
  } catch {
    return '未知';
  }
}
