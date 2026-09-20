export function errorMessage(err: unknown): string {
  if (typeof err === 'string') return err
  if (err instanceof Error && err.message) return err.message
  return '操作失败，请稍后重试'
}
