import { ref } from 'vue';

export type ToastVariant = 'success' | 'warning' | 'error' | 'info';

export interface ToastItem {
  id: number;
  title: string;
  description?: string;
  variant: ToastVariant;
}

const toasts = ref<ToastItem[]>([]);
let nextId = 1;
const TOAST_DURATION_MS = 5000;

/** 全局轻量 toast：模块级单例状态，任何组件可 push */
export function useToast() {
  function push(toast: Omit<ToastItem, 'id'>): void {
    // 相同标题去重（避免重连风暴刷屏）
    if (toasts.value.some((t) => t.title === toast.title)) return;
    const id = nextId++;
    toasts.value.push({ ...toast, id });
    setTimeout(() => dismiss(id), TOAST_DURATION_MS);
  }

  function dismiss(id: number): void {
    toasts.value = toasts.value.filter((t) => t.id !== id);
  }

  return { toasts, push, dismiss };
}
