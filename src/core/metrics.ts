/** 极简 Prometheus 指标注册表，零依赖，覆盖进程内可观测性需求 */

type LabelValue = string | number
type LabelSet = Record<string, LabelValue>

interface Series {
  labels: LabelSet
  value: number
}

interface HistogramSeries {
  labels: LabelSet
  counts: number[]
  sum: number
  total: number
}

interface Histogram {
  buckets: number[]
  series: Map<string, HistogramSeries>
}

const DEFAULT_BUCKETS = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000]

const counters = new Map<string, Map<string, Series>>()
const gauges = new Map<string, Map<string, Series>>()
const histograms = new Map<string, Histogram>()

function seriesKey(labels?: LabelSet): string {
  if (!labels) return ''
  return Object.keys(labels)
    .sort()
    .map((key) => `${key}=${labels[key]}`)
    .join(',')
}

function record(target: Map<string, Map<string, Series>>, name: string, delta: number, labels?: LabelSet): void {
  let byKey = target.get(name)
  if (!byKey) {
    byKey = new Map()
    target.set(name, byKey)
  }
  const key = seriesKey(labels)
  const existing = byKey.get(key)
  if (existing) existing.value += delta
  else byKey.set(key, { labels: labels ?? {}, value: delta })
}

export function increment(name: string, value = 1, labels?: LabelSet): void {
  record(counters, name, value, labels)
}

/** 设置瞬时值（同名标签组合覆盖），用于连接数、队列长度等 */
export function setGauge(name: string, value: number, labels?: LabelSet): void {
  let byKey = gauges.get(name)
  if (!byKey) {
    byKey = new Map()
    gauges.set(name, byKey)
  }
  byKey.set(seriesKey(labels), { labels: labels ?? {}, value })
}

export function observe(name: string, value: number, labels?: LabelSet): void {
  let histogram = histograms.get(name)
  if (!histogram) {
    histogram = { buckets: DEFAULT_BUCKETS, series: new Map() }
    histograms.set(name, histogram)
  }

  const key = seriesKey(labels)
  let series = histogram.series.get(key)
  if (!series) {
    series = { labels: labels ?? {}, counts: new Array(histogram.buckets.length + 1).fill(0), sum: 0, total: 0 }
    histogram.series.set(key, series)
  }

  let index = histogram.buckets.findIndex((bound) => value <= bound)
  if (index === -1) index = histogram.buckets.length
  series.counts[index] += 1
  series.sum += value
  series.total += 1
}

function escapeLabelValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')
}

function formatLabels(labels: LabelSet, extra?: LabelSet): string {
  const entries = Object.entries({ ...labels, ...extra })
  if (entries.length === 0) return ''
  return `{${entries.map(([key, value]) => `${key}="${escapeLabelValue(String(value))}"`).join(',')}}`
}

interface GaugeSource {
  name: string
  help: string
  collect: () => void
}

const gaugeSources = new Map<string, GaugeSource>()

/** 注册由外部状态派生的指标，每次采集时刷新；同名重复注册会被忽略 */
export function registerGaugeSource(name: string, help: string, collect: () => void): void {
  if (gaugeSources.has(name)) return
  gaugeSources.set(name, { name, help, collect })
}

export function renderMetrics(): string {
  for (const source of gaugeSources.values()) source.collect()

  const lines: string[] = []

  for (const [name, byKey] of counters) {
    lines.push(`# TYPE ${name} counter`)
    for (const series of byKey.values()) {
      lines.push(`${name}${formatLabels(series.labels)} ${series.value}`)
    }
  }

  for (const [name, byKey] of gauges) {
    lines.push(`# TYPE ${name} gauge`)
    for (const series of byKey.values()) {
      lines.push(`${name}${formatLabels(series.labels)} ${series.value}`)
    }
  }

  for (const [name, histogram] of histograms) {
    lines.push(`# TYPE ${name} histogram`)
    for (const series of histogram.series.values()) {
      let cumulative = 0
      histogram.buckets.forEach((bound, index) => {
        cumulative += series.counts[index]
        lines.push(`${name}_bucket${formatLabels(series.labels, { le: bound })} ${cumulative}`)
      })
      cumulative += series.counts[histogram.buckets.length]
      lines.push(`${name}_bucket${formatLabels(series.labels, { le: '+Inf' })} ${cumulative}`)
      lines.push(`${name}_sum${formatLabels(series.labels)} ${series.sum}`)
      lines.push(`${name}_count${formatLabels(series.labels)} ${series.total}`)
    }
  }

  return lines.join('\n') + '\n'
}
