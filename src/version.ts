import fs from 'node:fs'
import path from 'node:path'

let cachedVersion = ''

/**
 * 读取并获取系统统一定义的软件版本号
 */
export function getAppVersion(): string {
  if (cachedVersion) return cachedVersion
  try {
    const versionPath = path.resolve(process.cwd(), 'VERSION')
    if (fs.existsSync(versionPath)) {
      cachedVersion = fs.readFileSync(versionPath, 'utf-8').trim()
      return cachedVersion
    }
  } catch (_) {}
  cachedVersion = '1.1.1'
  return cachedVersion
}
