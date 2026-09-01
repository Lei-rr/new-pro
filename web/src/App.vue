<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue';
import AppShell from '@/components/layout/AppShell.vue';
import { useRealtimeStore } from '@/stores/realtime';

const realtime = useRealtimeStore();

onMounted(() => realtime.connect());
onBeforeUnmount(() => realtime.disconnect());
</script>

<template>
  <AppShell />
</template>
