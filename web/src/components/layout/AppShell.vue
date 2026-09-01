<script setup lang="ts">
import { useMediaQuery } from '@vueuse/core';
import AppSidebar from './AppSidebar.vue';
import AppHeader from './AppHeader.vue';
import { useAppStore } from '@/stores/app';

const app = useAppStore();
const isDesktop = useMediaQuery('(min-width: 1024px)');
</script>

<template>
  <div class="flex h-full bg-background text-foreground">
    <!-- 桌面端固定侧栏 -->
    <aside v-if="isDesktop" class="hidden w-56 shrink-0 border-r border-border lg:block">
      <AppSidebar />
    </aside>

    <!-- 移动端抽屉导航 -->
    <Sheet v-model:open="app.mobileNavOpen">
      <SheetContent side="left" class="w-64 p-0">
        <AppSidebar @navigate="app.mobileNavOpen = false" />
      </SheetContent>
    </Sheet>

    <div class="flex min-w-0 flex-1 flex-col">
      <AppHeader />
      <main class="flex-1 overflow-y-auto">
        <div class="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6">
          <RouterView />
        </div>
      </main>
    </div>
  </div>
</template>
