<script setup lang="ts">
import { Toaster } from '@/shared/ui/sonner'
</script>

<template>
  <RouterView />
  <Toaster position="bottom-right" rich-colors />
</template>
