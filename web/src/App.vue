<script setup lang="ts">
import AppShell from './components/layout/AppShell.vue';
import { useAppStore } from './stores/app';

useAppStore().init();
</script>

<template>
  <AppShell>
    <RouterView />
  </AppShell>
</template>
