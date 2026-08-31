<script setup lang="ts">
import VChart from 'vue-echarts';
import type { EChartsOption } from 'echarts';

defineProps<{
  option: EChartsOption;
  height?: string;
}>();
</script>

<template>
  <VChart
    :option="option"
    autoresize
    class="w-full"
    :style="{ height: height ?? '320px' }"
  />
</template>
