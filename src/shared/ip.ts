import { getConfig } from '../config.js'

const LOOPBACKS = new Set(['127.0.0.1', '::1', 'localhost', '0.0.0.0', ''])

function inCidrBlock(ip: string, prefix: string): boolean {
  return ip.startsWith(prefix)
}

/** RFC1918 / 回环 / 链路本地等非公网地址 */
export function isPrivateIp(ip: string): boolean {
  if (LOOPBACKS.has(ip)) return true
  if (inCidrBlock(ip, '10.')) return true
  if (inCidrBlock(ip, '192.168.')) return true
  if (inCidrBlock(ip, '169.254.')) return true
  if (inCidrBlock(ip, 'fc') || inCidrBlock(ip, 'fd')) return true

  if (ip.startsWith('172.')) {
    const second = Number(ip.split('.')[1])
    if (second >= 16 && second <= 31) return true
  }
  if (ip.startsWith('fe80:')) return true
  return false
}

/** 风控扫描需要豁免的内部节点（本机反代、内网探针等） */
export function isInternalSource(ip: string): boolean {
  if (!ip || ip === '未知' || ip === '-') return true
  if (isPrivateIp(ip)) return true
  return getConfig().internalIpList.includes(ip)
}

export interface SqlExclusion {
  /** 完整可拼接的过滤子句：调用方已有 WHERE 时为 `AND ...`，否则为 `WHERE ...` */
  clause: string
  /** 追加到查询参数末尾的值 */
  params: string[]
}

/**
 * 生成 SQL 侧的内网 IP 排除条件（参数化）。
 *
 * 必须在扫描阶段排除，而非取回后在 JS 里过滤：
 * 内部地址（尤其空 IP）请求量常居首位，会占用 ORDER BY ... LIMIT 的名额，
 * 把真实高危 IP 挤出结果集（线上空 IP 记录达 56 万条，稳居第一）。
 *
 * @param hasExistingWhere 调用方是否已存在 WHERE 子句，决定用 AND 还是 WHERE 连接
 */
export function buildInternalIpExclusion(
  column: string,
  paramOffset: number,
  hasExistingWhere: boolean
): SqlExclusion {
  const conditions = [
    `${column} != ''`,
    `${column} NOT LIKE '127.%'`,
    `${column} NOT LIKE '10.%'`,
    `${column} NOT LIKE '192.168.%'`,
    `${column} NOT LIKE '169.254.%'`,
    `${column} NOT LIKE '::1%'`,
    `${column} NOT LIKE 'fe80:%'`,
    // 172.16.0.0/12 需按第二段数值判断，正则覆盖
    `NOT (${column} ~ '^172\\.(1[6-9]|2[0-9]|3[01])\\.')`,
  ]

  const custom = getConfig().internalIpList
  if (custom.length > 0) {
    const placeholders = custom.map((_, index) => `$${paramOffset + index}`)
    conditions.push(`${column} NOT IN (${placeholders.join(', ')})`)
  }

  return {
    clause: `${hasExistingWhere ? 'AND' : 'WHERE'} ${conditions.join(' AND ')}`,
    params: custom,
  }
}
