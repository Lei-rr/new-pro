<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import * as echarts from 'echarts/core';
import { BarChart, LineChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { EChartsCoreOption } from 'echarts/core';
import { useAppStore } from '@/stores/app';
import { CHART_COLORS } from '@/lib/constants';

echarts.use([BarChart, LineChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer]);

const props = defineProps<{
  option: EChartsCoreOption;
  height?: string;
}>();

const app = useAppStore();
const el = ref<HTMLDivElement | null>(null);
let chart: echarts.ECharts | null = null;

function render(): void {
  if (!chart || !el.value) return;
  const colors = app.isDark ? [...CHART_COLORS.dark] : [...CHART_COLORS.light];
  const base = {
    color: colors,
    textStyle: { color: app.isDark ? '#a1a1aa' : '#3f3f46' },
    grid: { left: 8, right: 12, top: 24, bottom: 8, containLabel: true },
    tooltip: {
      trigger: 'axis',
      backgroundColor: app.isDark ? '#18181b' : '#ffffff',
      borderColor: app.isDark ? '#27272a' : '#e4e4e7',
      textStyle: { color: app.isDark ? '#fafafa' : '#18181b', fontSize: 12 },
    },
  };
  chart.setOption({ ...base, ...props.option }, true);
}

function resize(): void {
  chart?.resize();
}

onMounted(() => {
  if (!el.value) return;
  chart = echarts.init(el.value);
  render();
  window.addEventListener('resize', resize);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', resize);
  chart?.dispose();
  chart = null;
});

watch(() => [props.option, app.isDark], render, { deep: true });
</script>

<template>
  <div ref="el" class="w-full" :style="{ height: height ?? '260px' }" />
</template>
