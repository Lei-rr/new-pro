import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';

export type Theme = 'light' | 'dark';

/** 全局应用状态：主题、侧栏（移动端）、全局时间范围 */
export const useAppStore = defineStore('app', () => {
  const theme = ref<Theme>(
    (localStorage.getItem('newpro-theme') as Theme) ??
      (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
  );
  const mobileNavOpen = ref(false);
  const rangeHours = ref(24);

  const isDark = computed(() => theme.value === 'dark');

  function applyTheme(): void {
    document.documentElement.classList.toggle('dark', isDark.value);
  }

  function toggleTheme(): void {
    theme.value = isDark.value ? 'light' : 'dark';
    localStorage.setItem('newpro-theme', theme.value);
    applyTheme();
  }

  function setRange(hours: number): void {
    rangeHours.value = hours;
  }

  watch(theme, applyTheme, { immediate: true });

  return { theme, isDark, toggleTheme, mobileNavOpen, rangeHours, setRange };
});
