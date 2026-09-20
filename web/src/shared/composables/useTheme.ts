import { ref } from 'vue'

const STORAGE_KEY = 'theme'
const isDark = ref(false)

function apply(dark: boolean): void {
  isDark.value = dark
  document.documentElement.classList.toggle('dark', dark)
}

/** 主题状态为模块级单例，多处调用共享同一份状态 */
export function useTheme() {
  function initTheme(): void {
    apply(localStorage.getItem(STORAGE_KEY) === 'dark')
  }

  function toggleTheme(): void {
    const next = !isDark.value
    apply(next)
    localStorage.setItem(STORAGE_KEY, next ? 'dark' : 'light')
  }

  return { isDark, initTheme, toggleTheme }
}
