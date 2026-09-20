import { onMounted, onUnmounted } from 'vue'

export interface AutoRefreshOptions {
  /** 后台静默刷新间隔（毫秒），0 表示不轮询 */
  intervalMs?: number
  /** 用户主动触发刷新时的回调，缺省复用静默刷新函数 */
  onManualRefresh?: () => void | Promise<void>
}

export const REFRESH_EVENT = 'new-pro:refresh'

/** 页面定时静默刷新 + 全局强制刷新事件订阅，组件卸载时自动释放 */
export function useAutoRefresh(
  refresh: () => void | Promise<void>,
  options: AutoRefreshOptions = {}
) {
  let timer: number | null = null

  const handleManualRefresh = () => {
    void (options.onManualRefresh ? options.onManualRefresh() : refresh())
  }

  const stop = () => {
    if (timer !== null) {
      window.clearInterval(timer)
      timer = null
    }
  }

  onMounted(() => {
    window.addEventListener(REFRESH_EVENT, handleManualRefresh)
    if (options.intervalMs && options.intervalMs > 0) {
      timer = window.setInterval(() => void refresh(), options.intervalMs)
    }
  })

  onUnmounted(() => {
    window.removeEventListener(REFRESH_EVENT, handleManualRefresh)
    stop()
  })

  return { stop }
}

export function triggerGlobalRefresh(): void {
  window.dispatchEvent(new CustomEvent(REFRESH_EVENT))
}
