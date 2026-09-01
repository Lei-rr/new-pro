<script setup lang="ts">
import { CheckCircle2, CircleAlert, Info, TriangleAlert, X } from '@lucide/vue';
import { useToast } from '@/lib/toast';

const { toasts, dismiss } = useToast();

const ICONS = {
  success: CheckCircle2,
  warning: TriangleAlert,
  error: CircleAlert,
  info: Info,
} as const;

const COLORS = {
  success: 'border-emerald-500/30 text-emerald-600 dark:text-emerald-400',
  warning: 'border-amber-500/30 text-amber-600 dark:text-amber-400',
  error: 'border-red-500/30 text-red-600 dark:text-red-400',
  info: 'border-sky-500/30 text-sky-600 dark:text-sky-400',
} as const;
</script>

<template>
  <!-- Toast 容器：右上角，移动端全宽 -->
  <div class="pointer-events-none fixed right-4 top-16 z-[100] flex w-72 flex-col gap-2 sm:w-80">
    <TransitionGroup
      name="toast"
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="translate-x-4 opacity-0"
      enter-to-class="translate-x-0 opacity-100"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-for="t in toasts"
        :key="t.id"
        class="pointer-events-auto flex items-start gap-2.5 rounded-lg border bg-card p-3 shadow-lg"
      >
        <component :is="ICONS[t.variant]" class="mt-0.5 size-4 shrink-0" :class="COLORS[t.variant]" />
        <div class="min-w-0 flex-1">
          <p class="text-xs font-semibold">{{ t.title }}</p>
          <p v-if="t.description" class="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{{ t.description }}</p>
        </div>
        <Button variant="ghost" size="icon-xs" class="-mr-1 shrink-0" @click="dismiss(t.id)">
          <X class="size-3" />
        </Button>
      </div>
    </TransitionGroup>
  </div>
</template>
