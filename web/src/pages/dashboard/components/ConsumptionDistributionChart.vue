<script setup lang="ts">
import { ref, computed } from 'vue'
import VChart from 'vue-echarts'
import '@/shared/lib/echarts'
import { BarChart3, AreaChart, WalletCards, Hash } from '@lucide/vue'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card'
import { Button } from '@/shared/ui/button'
import { Badge } from '@/shared/ui/badge'
import { formatNumber, formatTokens } from '@/shared/lib/utils'

const props = defineProps<{
  distribution?: {
    timePoints: string[]
    models: string[]
    series: Array<{
      modelName: string
      quotaData: number[]
      tokensData: number[]
    }>
  }
}>()

// 切换模式：bar (柱状堆叠) vs area (平滑面积流)
const chartType = ref<'bar' | 'area'>('area')
// 切换指标：quota (额度金额) vs tokens (Token吞吐)
const metricType = ref<'quota' | 'tokens'>('quota')

const colorPalette = [
  '#10b981', // 翡翠绿 (极速/成功)
  '#0ea5e9', // 天空蓝 (正常)
  '#f59e0b', // 琥珀黄 (较慢)
  '#ef4444', // 警示红 (极慢)
  '#8b5cf6', // 优雅紫
  '#06b6d4', // 湖蓝
]

const chartOption = computed(() => {
  const dist = props.distribution
  if (!dist || !dist.timePoints?.length || !dist.series?.length) {
    return null
  }

  const xData = dist.timePoints.map((tp) => tp.split(' ')[1] || tp.slice(5))

  const series = dist.series.map((s, idx) => {
    const rawArr = metricType.value === 'quota' ? s.quotaData : s.tokensData
    const data = metricType.value === 'quota' ? rawArr.map((v) => Number((v / 500000).toFixed(4))) : rawArr
    const color = colorPalette[idx % colorPalette.length]

    if (chartType.value === 'area') {
      return {
        name: s.modelName,
        type: 'line',
        stack: 'Total',
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 1.5, color },
        areaStyle: {
          opacity: 0.35,
          color,
        },
        data,
      }
    }

    return {
      name: s.modelName,
      type: 'bar',
      stack: 'Total',
      barMaxWidth: 20,
      itemStyle: { color },
      data,
    }
  })

  return {
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: chartType.value === 'bar' ? 'shadow' : 'cross',
      },
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      borderColor: 'rgba(226, 232, 240, 0.9)',
      textStyle: { color: '#0f172a', fontSize: 12 },
      extraCssText: 'box-shadow: 0 4px 12px rgba(0,0,0,0.08); border-radius: 8px;',
      formatter: (params: any[]) => {
        if (!params?.length) return ''
        const title = dist.timePoints[params[0].dataIndex] || params[0].name
        let html = `<div class="font-bold border-b border-slate-100 pb-1 mb-1.5 text-slate-800">${title}</div>`
        params.forEach((p) => {
          const valDisplay = metricType.value === 'quota' ? `$${Number(p.value).toFixed(4)}` : formatTokens(p.value)
          html += `
            <div class="flex items-center justify-between gap-6 py-0.5 text-xs">
              <span class="flex items-center gap-1.5 truncate max-w-[150px]">
                <span class="size-2 rounded-full inline-block shrink-0" style="background-color: ${p.color};"></span>
                <span class="text-slate-600 truncate">${p.seriesName}</span>
              </span>
              <span class="font-mono font-semibold text-slate-900">${valDisplay}</span>
            </div>
          `
        })
        return html
      },
    },
    legend: {
      data: dist.models,
      top: '0%',
      right: '2%',
      textStyle: { color: '#64748b', fontSize: 11 },
      icon: 'circle',
      itemWidth: 8,
      itemHeight: 8,
    },
    grid: {
      left: '2%',
      right: '2%',
      top: '12%',
      bottom: '6%',
      containLabel: true,
    },
    xAxis: {
      type: 'category',
      data: xData,
      axisLine: { lineStyle: { color: 'rgba(148, 163, 184, 0.25)' } },
      axisLabel: { color: '#64748b', fontSize: 11 },
    },
    yAxis: {
      type: 'value',
      name: metricType.value === 'quota' ? '金额 ($)' : 'Token',
      nameTextStyle: { color: '#64748b', fontSize: 11 },
      splitLine: { lineStyle: { color: 'rgba(148, 163, 184, 0.15)', type: 'dashed' } },
      axisLabel: {
        color: '#64748b',
        fontSize: 11,
        formatter: (v: number) => metricType.value === 'quota' ? `$${v}` : formatTokens(v),
      },
    },
    series,
  }
})
</script>

<template>
  <Card class="border-border/60 shadow-xs">
    <CardHeader class="pb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <div>
        <CardTitle class="text-base font-semibold flex items-center gap-2">
          <WalletCards class="size-4 text-primary" />
          <span>核心模型消耗分布演变</span>
          <Badge variant="outline" class="font-normal text-[11px] text-muted-foreground">
            TOP 5 头部模型
          </Badge>
        </CardTitle>
        <CardDescription class="text-xs">
          按选定时段展示各主力模型的额度资金与物理 Token 消耗演变
        </CardDescription>
      </div>

      <!-- 操作控件：指标切换 + 柱状/面积流切换 -->
      <div class="flex items-center gap-2 flex-wrap">
        <!-- 指标切换 -->
        <div class="inline-flex rounded-lg border border-border/60 bg-muted/30 p-0.5">
          <Button
            size="xs"
            variant="ghost"
            class="h-6.5 text-xs px-2 rounded-md cursor-pointer transition-all gap-1"
            :class="metricType === 'quota' ? 'bg-card text-foreground shadow-xs font-semibold' : 'text-muted-foreground hover:text-foreground'"
            @click="metricType = 'quota'"
          >
            <WalletCards class="size-3" />
            <span>额度($)</span>
          </Button>
          <Button
            size="xs"
            variant="ghost"
            class="h-6.5 text-xs px-2 rounded-md cursor-pointer transition-all gap-1"
            :class="metricType === 'tokens' ? 'bg-card text-foreground shadow-xs font-semibold' : 'text-muted-foreground hover:text-foreground'"
            @click="metricType = 'tokens'"
          >
            <Hash class="size-3" />
            <span>Token</span>
          </Button>
        </div>

        <!-- 图表类型切换：柱状堆叠 vs 面积流 -->
        <div class="inline-flex rounded-lg border border-border/60 bg-muted/30 p-0.5">
          <Button
            size="xs"
            variant="ghost"
            class="h-6.5 text-xs px-2 rounded-md cursor-pointer transition-all gap-1"
            :class="chartType === 'area' ? 'bg-card text-foreground shadow-xs font-semibold' : 'text-muted-foreground hover:text-foreground'"
            @click="chartType = 'area'"
            title="面积流图"
          >
            <AreaChart class="size-3.5" />
            <span>面积流</span>
          </Button>
          <Button
            size="xs"
            variant="ghost"
            class="h-6.5 text-xs px-2 rounded-md cursor-pointer transition-all gap-1"
            :class="chartType === 'bar' ? 'bg-card text-foreground shadow-xs font-semibold' : 'text-muted-foreground hover:text-foreground'"
            @click="chartType = 'bar'"
            title="柱状堆叠图"
          >
            <BarChart3 class="size-3.5" />
            <span>柱状</span>
          </Button>
        </div>
      </div>
    </CardHeader>

    <CardContent class="pt-0">
      <div v-if="chartOption" class="h-64 w-full">
        <VChart :option="chartOption" autoresize class="h-full w-full" />
      </div>
      <div v-else class="h-64 flex items-center justify-center text-xs text-muted-foreground">
        所选时段内暂无核心模型消耗分布
      </div>
    </CardContent>
  </Card>
</template>
