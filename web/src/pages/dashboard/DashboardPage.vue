<script setup lang="ts">

import { Button } from '@/shared/ui/button'
import { Badge } from '@/shared/ui/badge'
import { TIME_RANGES } from '@/shared/constants/time-ranges'
import { useDashboardData } from '@/features/dashboard/composables/useDashboardData'
import RealtimeBanners from './components/RealtimeBanners.vue'
import SummaryCards from './components/SummaryCards.vue'
import RealtimeLogTable from './components/RealtimeLogTable.vue'
import TrendMetricsChart from './components/TrendMetricsChart.vue'
import ChannelUptimePanel from './components/ChannelUptimePanel.vue'
import ConsumptionDistributionChart from './components/ConsumptionDistributionChart.vue'
import PerformanceHealthPanel from './components/PerformanceHealthPanel.vue'
import StreamAndLatencyPanel from './components/StreamAndLatencyPanel.vue'

const { overview, pulseMetrics, realtimeLogs, currentRange, loading, refreshing, selectRange } =
  useDashboardData()
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 class="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <span>控制台大屏</span>
          <Badge variant="outline" class="font-normal text-xs text-muted-foreground border-border/80">
            实时直连分析
          </Badge>
          <Badge v-if="loading" variant="secondary" class="font-normal text-xs animate-pulse">加载中...</Badge>
          <Badge v-else-if="refreshing" variant="secondary" class="font-normal text-xs animate-pulse">校准中...</Badge>
        </h1>
        <p class="text-xs text-muted-foreground mt-1">
          当前监控 NewAPI 核心网关与上游调度状态，秒级刷新吞吐量与时序分布
        </p>
      </div>

      <div class="inline-flex max-w-full overflow-x-auto no-scrollbar rounded-lg border border-border/60 bg-muted/30 p-1">
        <Button
          v-for="item in TIME_RANGES"
          :key="item.key"
          size="xs"
          variant="ghost"
          class="h-7 text-xs px-2.5 rounded-md cursor-pointer transition-all shrink-0 whitespace-nowrap"
          :class="
            currentRange === item.key
              ? 'bg-card text-foreground shadow-xs font-semibold'
              : 'text-muted-foreground hover:text-foreground'
          "
          @click="selectRange(item.key)"
        >
          {{ item.label }}
        </Button>
      </div>
    </div>

    <RealtimeBanners :pulse="pulseMetrics" :overview="overview" />

    <!--
      按响应中的区间标识重建组件：新口径数据落地后才重挂载，
      使 only-up 数值从新数值重新起算，避免被上一区间的大数值永久锁死
    -->
    <SummaryCards :key="overview?.timeRange.key ?? 'pending'" :overview="overview" :pulse="pulseMetrics" />

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <TrendMetricsChart :trend="overview?.trend" />
      <ChannelUptimePanel :channels="overview?.topChannels" />
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div class="lg:col-span-2">
        <ConsumptionDistributionChart :distribution="overview?.modelConsumptionDistribution" />
      </div>
      <div>
        <PerformanceHealthPanel :health="overview?.performanceHealth" />
      </div>
    </div>

    <StreamAndLatencyPanel :stream="overview?.streamEfficiency" :latency="overview?.latencyBuckets" />

    <RealtimeLogTable :logs="realtimeLogs" />
  </div>
</template>
