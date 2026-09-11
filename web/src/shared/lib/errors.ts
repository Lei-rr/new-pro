export function errorMessage(err: unknown): string {
  if (typeof err === 'string') return err
  if (err && typeof err === 'object' && 'message' in err) {
    return String((err as any).message)
  }
  return '操作失败，请稍后重试'
}
