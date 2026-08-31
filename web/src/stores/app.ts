import { defineStore } from 'pinia';
import { ref } from 'vue';

const THEME_KEY = 'theme';
export type Theme = 'light' | 'dark';

export const useAppStore = defineStore('app', () => {
  const theme = ref<Theme>('light');

  function apply(): void {
    document.documentElement.classList.toggle('dark', theme.value === 'dark');
  }

  function init(): void {
    const saved = localStorage.getItem(THEME_KEY) as Theme | null;
    theme.value = saved === 'dark' ? 'dark' : 'light';
    apply();
  }

  function toggleTheme(): void {
    theme.value = theme.value === 'light' ? 'dark' : 'light';
    localStorage.setItem(THEME_KEY, theme.value);
    apply();
  }

  return { theme, init, toggleTheme };
});
