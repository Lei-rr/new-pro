export interface ApiResponse<T = any> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

let unauthorizedHandler: (() => void) | null = null

export function setUnauthorizedHandler(fn: () => void) {
  unauthorizedHandler = fn
}

export async function request<T = any>(url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers || {})
  if (!headers.has('Content-Type') && !(init?.body instanceof FormData) && init?.body) {
    headers.set('Content-Type', 'application/json')
  }

  const res = await fetch(url, {
    ...init,
    headers,
    credentials: 'include',
  })

  if (res.status === 401) {
    if (unauthorizedHandler) {
      unauthorizedHandler()
    }
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || '未授权或登录已过期')
  }

  const data: ApiResponse<T> = await res.json().catch(() => ({
    success: false,
    error: `请求响应异常 (${res.status})`,
  }))

  if (!res.ok || !data.success) {
    throw new Error(data.error || data.message || `请求失败 (${res.status})`)
  }

  return data.data as T
}

export const http = {
  get: <T = any>(url: string) => request<T>(url, { method: 'GET' }),
  post: <T = any>(url: string, body?: any) =>
    request<T>(url, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    }),
}
