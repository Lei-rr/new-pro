import fs from 'node:fs'
import path from 'node:path'

const FALLBACK_VERSION = '0.0.0'

let cachedVersion: string | null = null

/** 读取根目录 VERSION 文件，作为前后端统一版本真相源 */
export function getAppVersion(): string {
  if (cachedVersion) return cachedVersion
  try {
    const file = path.resolve(process.cwd(), 'VERSION')
    const text = fs.readFileSync(file, 'utf-8').trim()
    cachedVersion = text || FALLBACK_VERSION
  } catch {
    cachedVersion = FALLBACK_VERSION
  }
  return cachedVersion
}
