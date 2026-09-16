<script setup lang="ts">
import { ref, computed } from 'vue'
import VChart from 'vue-echarts'
import '@/shared/lib/echarts'
import { AreaChart, BarChart3 } from '@lucide/vue'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card'
import { Button } from '@/shared/ui/button'
import { formatTokens } from '@/shared/lib/utils'

export interface TrendItem {
  timePoint: string
  total: number
  success: number
  failed: number
  quota: number
  tokens: number
  avgLatency: number
}

const props = defineProps<{
  trend?: TrendItem[]
}>()

const trendChartType = ref<'bar' | 'area'>('area')

const chartOption = computed(() => {
  const trend = props.trend || []
  const xData = trend.map((t) => t.timePoint.split(' ')[1] || t.timePoint.slice(5))
  const successData = trend.map((t) => t.success)
  const failedData = trend.map((t) => t.failed)
  const latencyData = trend.map((t) => t.avgLatency)

  return {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      backgroundColor: 'rgba(15, 23, 42, 0.85)',
      borderColor: 'rgba(255, 255, 255, 0.1)',
      textStyle: { color: '#f8fafc', fontSize: 12 },
      formatter: (params: any[]) => {
        if (!params || !params.length) return ''
        const idx = params[0].dataIndex
        const item = trend[idx]
        if (!item) return ''
        return `
          <div style="font-weight: bold; margin-bottom: 4px; border-bottom: 1px solid rgba(255,255,255,0.2); padding-bottom: 4px;">${item.timePoint}</div>
          <div style="display: flex; justify-content: space-between; gap: 16px;"><span>总请求:</span><span style="font-family: monospace; font-weight: 600;">${item.total.toLocaleString()}</span></div>
          <div style="display: flex; justify-content: space-between; gap: 16px; color: #34d399;"><span>成功:</span><span style="font-family: monospace; font-weight: 600;">${item.success.toLocaleString()}</span></div>
          <div style="display: flex; justify-content: space-between; gap: 16px; color: #fb7185;"><span>失败:</span><span style="font-family: monospace; font-weight: 600;">${item.failed.toLocaleString()}</span></div>
          <div style="display: flex; justify-content: space-between; gap: 16px; color: #38bdf8;"><span>消耗 Token:</span><span style="font-family: monospace; font-weight: 600;">${formatTokens(item.tokens)}</span></div>
          <div style="display: flex; justify-content: space-between; gap: 16px; color: #fcd34d;"><span>平均延迟:</span><span style="font-family: monospace; font-weight: 600;">${item.avgLatency}ms</span></div>
        `
      },
    },
    legend: {
      data: ['成功', '失败', '延迟(ms)'],
      left: 'center',
      top: '0%',
      textStyle: { color: '#888888', fontSize: 11 },
      itemWidth: 10,
      itemHeight: 10,
    },
    grid: {
      left: '1%',
      right: '1%',
      top: '16%',
      bottom: '5%',
      containLabel: true,
    },
    xAxis: {
      type: 'category',
      data: xData,
      axisLine: { lineStyle: { color: 'rgba(128, 128, 128, 0.25)' } },
      axisLabel: { color: '#888888', fontSize: 11 },
    },
    yAxis: [
      {
        type: 'value',
        name: '请求数',
        nameTextStyle: { color: '#888888', fontSize: 11, padding: [0, 0, 4, 0] },
        splitLine: { lineStyle: { color: 'rgba(128, 128, 128, 0.15)', type: 'dashed' } },
        axisLabel: { color: '#888888', fontSize: 11 },
      },
      {
        type: 'value',
        name: '延迟 (ms)',
        nameTextStyle: { color: '#888888', fontSize: 11, padding: [0, 0, 4, 0] },
        splitLine: { show: false },
        axisLabel: { color: '#888888', fontSize: 11 },
      },
    ],
    series:
      trendChartType.value === 'area'
        ? [
            {
              name: '成功',
              type: 'line',
              stack: 'total',
              smooth: true,
              showSymbol: false,
              lineStyle: { width: 1.5, color: '#10b981' },
              itemStyle: { color: '#10b981' },
              areaStyle: { opacity: 0.35, color: '#10b981' },
              data: successData,
            },
            {
              name: '失败',
              type: 'line',
              stack: 'total',
              smooth: true,
              showSymbol: false,
              lineStyle: { width: 1.5, color: '#ef4444' },
              itemStyle: { color: '#ef4444' },
              areaStyle: { opacity: 0.35, color: '#ef4444' },
              data: failedData,
            },
            {
              name: '延迟(ms)',
              type: 'line',
              yAxisIndex: 1,
              smooth: true,
              showSymbol: false,
              itemStyle: { color: '#0ea5e9' },
              lineStyle: {
                width: 2,
                color: '#0ea5e9',
                shadowColor: 'rgba(14, 165, 233, 0.25)',
                shadowBlur: 6,
              },
              data: latencyData,
            },
          ]
        : [
            {
              name: '成功',
              type: 'bar',
              stack: 'total',
              barMaxWidth: 24,
              itemStyle: { color: '#10b981', borderRadius: [0, 0, 0, 0] },
              data: successData,
            },
            {
              name: '失败',
              type: 'bar',
              stack: 'total',
              barMaxWidth: 24,
              itemStyle: { color: '#ef4444', borderRadius: [3, 3, 0, 0] },
              data: failedData,
            },
            {
              name: '延迟(ms)',
              type: 'line',
              yAxisIndex: 1,
              smooth: true,
              showSymbol: false,
              itemStyle: { color: '#0ea5e9' },
              lineStyle: {
                width: 2,
                color: '#0ea5e9',
                shadowColor: 'rgba(14, 165, 233, 0.25)',
                shadowBlur: 6,
              },
              data: latencyData,
            },
          ],
    dataZoom: [{ type: 'inside', start: 0, end: 100 }],
  }
})
</script>

<template>
  <Card class="border-border/60 shadow-xs lg:col-span-2">
    <CardHeader class="pb-2 flex flex-row items-center justify-between">
      <div>
        <CardTitle class="text-base font-semibold">请求与错误分布趋势</CardTitle>
        <CardDescription class="text-xs">
          时间跨度内各时段请求量、异常数与响应延迟走势
        </CardDescription>
      </div>

      <div class="inline-flex rounded-lg border border-border/60 bg-muted/30 p-0.5">
        <Button
          size="xs"
          variant="ghost"
          class="h-6.5 text-xs px-2 rounded-md cursor-pointer transition-all gap-1"
          :class="trendChartType === 'area' ? 'bg-card text-foreground shadow-xs font-semibold' : 'text-muted-foreground hover:text-foreground'"
          @click="trendChartType = 'area'"
          title="面积流图"
        >
          <AreaChart class="size-3.5" />
          <span>面积流</span>
        </Button>
        <Button
          size="xs"
          variant="ghost"
          class="h-6.5 text-xs px-2 rounded-md cursor-pointer transition-all gap-1"
          :class="trendChartType === 'bar' ? 'bg-card text-foreground shadow-xs font-semibold' : 'text-muted-foreground hover:text-foreground'"
          @click="trendChartType = 'bar'"
          title="柱状堆叠图"
        >
          <BarChart3 class="size-3.5" />
          <span>柱状</span>
        </Button>
      </div>
    </CardHeader>
    <CardContent class="pt-2">
      <div v-if="trend && trend.length > 0" class="h-64 w-full">
        <VChart :option="chartOption" autoresize class="h-full w-full" />
      </div>
      <div v-else class="h-44 flex items-center justify-center text-xs text-muted-foreground">
        所选时段内暂无日志调用
      </div>
    </CardContent>
  </Card>
</template>
