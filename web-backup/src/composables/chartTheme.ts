import { computed } from 'vue';
import { useAppStore } from '@/stores/app';

/** 图表随主题切换的文字/网格颜色 */
export function useChartTheme() {
  const app = useAppStore();
  const isDark = computed(() => app.theme === 'dark');
  const text = computed(() => (isDark.value ? '#94a3b8' : '#64748b'));
  const grid = computed(() => (isDark.value ? '#1e293b' : '#e2e8f0'));
  return { isDark, text, grid };
}
