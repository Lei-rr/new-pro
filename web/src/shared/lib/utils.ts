import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * 格式化 Token 数量：自动匹配 B (Billion), M (Million), k (Thousand)
 * 1,000,000,000+ -> 1.25B
 * 1,000,000+ -> 45.2M
 * 1,000+ -> 12.5k
 */
export function formatTokens(tokens: number = 0): string {
  const abs = Math.abs(tokens)
  const sign = tokens < 0 ? '-' : ''
  if (abs >= 1_000_000_000) {
    return `${sign}${(abs / 1_000_000_000).toFixed(2)}B`
  }
  if (abs >= 1_000_000) {
    return `${sign}${(abs / 1_000_000).toFixed(2)}M`
  }
  if (abs >= 1_000) {
    return `${sign}${(abs / 1_000).toFixed(1)}k`
  }
  return String(tokens)
}

/**
 * 格式化通用数值带千分位
 */
export function formatNumber(num: number = 0): string {
  return Number(num || 0).toLocaleString()
}

/**
 * 兼容 HTTP 与 HTTPS 各种安全上下文的强健剪贴板写入工具
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (!text) return false
  
  // 1. 尝试使用 navigator.clipboard API (在 HTTPS 或 localhost 下可用)
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch (_) {}
  }

  // 2. HTTP 或无权限环境下的 textarea + execCommand 兼容方案
  try {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.left = '-9999px'
    textarea.style.top = '-9999px'
    textarea.style.opacity = '0'
    textarea.setAttribute('readonly', '')
    document.body.appendChild(textarea)
    textarea.focus()
    textarea.select()
    const successful = document.execCommand('copy')
    document.body.removeChild(textarea)
    return successful
  } catch (err) {
    console.error('Fallback copy failed:', err)
    return false
  }
}


