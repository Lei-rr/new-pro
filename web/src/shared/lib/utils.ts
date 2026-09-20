import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export const QUOTA_PER_USD = 500_000

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** 大数缩略：1.25B / 45.2M / 12.5k */
export function formatTokens(tokens = 0): string {
  const abs = Math.abs(tokens)
  const sign = tokens < 0 ? '-' : ''
  if (abs >= 1_000_000_000) return `${sign}${(abs / 1_000_000_000).toFixed(2)}B`
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(2)}M`
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(1)}k`
  return String(tokens)
}

export function formatNumber(num = 0): string {
  return Number(num || 0).toLocaleString()
}

/** 剪贴板写入，兼容 HTTP 非安全上下文 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (!text) return false

  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // 继续降级到 execCommand
    }
  }

  try {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.setAttribute('readonly', '')
    textarea.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0'
    document.body.appendChild(textarea)
    textarea.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(textarea)
    return ok
  } catch {
    return false
  }
}
