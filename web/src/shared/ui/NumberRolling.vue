<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'

const props = withDefaults(
  defineProps<{
    value: number
    precision?: number
    prefix?: string
    suffix?: string
    duration?: number
    formatFn?: (val: number) => string
    onlyUp?: boolean
  }>(),
  {
    precision: 0,
    prefix: '',
    suffix: '',
    duration: 650,
    onlyUp: false,
  }
)

const displayValue = ref(props.value || 0)
let animationFrameId: number | null = null

function animate(startVal: number, endVal: number, duration: number) {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId)
    animationFrameId = null
  }

  // 若数值变化极小或无持续时间，直接赋值
  if (Math.abs(startVal - endVal) < 0.00001 || duration <= 0) {
    displayValue.value = endVal
    return
  }

  const startTime = performance.now()

  function step(currentTime: number) {
    const elapsed = currentTime - startTime
    const progress = Math.min(elapsed / duration, 1)
    // easeOutQuad 缓动曲线
    const ease = 1 - (1 - progress) * (1 - progress)
    displayValue.value = startVal + (endVal - startVal) * ease

    if (progress < 1) {
      animationFrameId = requestAnimationFrame(step)
    } else {
      displayValue.value = endVal
      animationFrameId = null
    }
  }

  animationFrameId = requestAnimationFrame(step)
}

watch(
  () => props.value,
  (newVal, oldVal) => {
    const target = newVal ?? 0
    const current = oldVal ?? displayValue.value
    if (props.onlyUp && target < current) {
      // 若开启了仅单向递增，且新值变小，则保持原数值不倒退
      return
    }
    animate(current, target, props.duration)
  }
)

onMounted(() => {
  if (props.value > 0) {
    animate(0, props.value, props.duration)
  }
})

onUnmounted(() => {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId)
  }
})

function format(val: number): string {
  if (props.formatFn) {
    return props.formatFn(val)
  }
  if (props.precision > 0) {
    return val.toLocaleString(undefined, {
      minimumFractionDigits: props.precision,
      maximumFractionDigits: props.precision,
    })
  }
  return Math.round(val).toLocaleString()
}
</script>

<template>
  <span class="inline-flex items-baseline font-mono tracking-tight transition-colors whitespace-nowrap">
    <span v-if="prefix" class="mr-0.5">{{ prefix }}</span>
    <span>{{ format(displayValue) }}</span>
    <span v-if="suffix" class="ml-0.5 text-xs font-normal text-muted-foreground">{{ suffix }}</span>
  </span>
</template>
