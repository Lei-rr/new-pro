<script setup lang="ts">
import { onBeforeUnmount, onMounted, watch } from 'vue';
import AppShell from '@/components/layout/AppShell.vue';
import ToastHost from '@/components/layout/ToastHost.vue';
import { useRealtimeStore } from '@/stores/realtime';
import { useToast } from '@/lib/toast';

const realtime = useRealtimeStore();
const toast = useToast();

onMounted(() => realtime.connect());
onBeforeUnmount(() => realtime.disconnect());

// WS 连接状态变化 → toast 提醒
let firstConnect = true;
watch(
  () => realtime.connected,
  (open) => {
    if (open) {
      if (!firstConnect) {
        toast.push({ title: '实时连接已恢复', variant: 'success' });
      }
      firstConnect = false;
    } else {
      toast.push({ title: '实时连接断开', description: '正在自动重连…', variant: 'warning' });
    }
  },
);
</script>

<template>
  <AppShell />
  <ToastHost />
</template>
