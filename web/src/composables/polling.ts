import { onBeforeUnmount } from 'vue';

export function usePolling(fn: () => void | Promise<void>, intervalMs: number): void {
  const timer = setInterval(() => {
    void fn();
  }, intervalMs);
  onBeforeUnmount(() => clearInterval(timer));
}
