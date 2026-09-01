import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

export type TimeRangePreset = '1h' | '6h' | '24h' | '7d' | '30d' | 'all';

export interface TimeRangeItem {
  key: TimeRangePreset;
  label: string;
  hours: number;
  days: number;
}

export const TIME_RANGE_PRESETS: TimeRangeItem[] = [
  { key: '1h', label: '近1小时', hours: 1, days: 1 },
  { key: '6h', label: '近6小时', hours: 6, days: 1 },
  { key: '24h', label: '近24小时', hours: 24, days: 1 },
  { key: '7d', label: '近7天', hours: 168, days: 7 },
  { key: '30d', label: '近30天', hours: 168, days: 30 },
  { key: 'all', label: '全部', hours: 168, days: 90 },
];

export const useTimeRangeStore = defineStore('timeRange', () => {
  const preset = ref<TimeRangePreset>('24h');

  const current = computed(() => {
    return TIME_RANGE_PRESETS.find((p) => p.key === preset.value) ?? TIME_RANGE_PRESETS[2];
  });

  const range = computed<{ start?: number; end?: number }>(() => {
    if (preset.value === 'all') {
      return {};
    }
    const now = Date.now();
    let ms = 24 * 3600_000;
    if (preset.value === '1h') ms = 3600_000;
    else if (preset.value === '6h') ms = 6 * 3600_000;
    else if (preset.value === '24h') ms = 24 * 3600_000;
    else if (preset.value === '7d') ms = 7 * 86400_000;
    else if (preset.value === '30d') ms = 30 * 86400_000;

    return {
      start: now - ms,
      end: now,
    };
  });

  function setPreset(p: TimeRangePreset): void {
    preset.value = p;
  }

  return { preset, current, range, setPreset };
});
