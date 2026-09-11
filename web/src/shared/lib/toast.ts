import { toast as sonnerToast } from 'vue-sonner'

export const toast = {
  success: (msg: string) => sonnerToast.success(msg),
  error: (msg: string) => sonnerToast.error(msg),
  warning: (msg: string) => sonnerToast.warning(msg),
  info: (msg: string) => sonnerToast.info(msg),
}
