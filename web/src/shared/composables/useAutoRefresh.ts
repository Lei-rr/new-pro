import { onMounted, onUnmounted } from 'vue'

export interface AutoRefreshOptions {
  intervalMs?: number
  onRefreshEvent?: () => void | Promise<void>
}

/**
 * 封装页面定时轮询与全局强制刷新事件订阅，离开页面自动卸载定时器与监听器
 */
export function useAutoRefresh(
  refreshFn: () => void | Promise<void>,
  options: AutoRefreshOptions = {}
) {
  let timer: any = null

  const handleCustomEvent = () => {
    if (options.onRefreshEvent) {
      options.onRefreshEvent()
    } else {
      refreshFn()
    }
  }

  onMounted(() => {
    window.addEventListener('new-pro:refresh', handleCustomEvent)

    if (options.intervalMs && options.intervalMs > 0) {
      timer = setInterval(() => {
        refreshFn()
      }, options.intervalMs)
    }
  })

  onUnmounted(() => {
    window.removeEventListener('new-pro:refresh', handleCustomEvent)
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  })

  return {
    stop: () => {
      if (timer) {
        clearInterval(timer)
        timer = null
      }
    },
  }
}
