export interface ApiEnvelope<T> {
  success: boolean
  data?: T
  error?: string
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly kind: 'network' | 'timeout' | 'http' = 'http'
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

type UnauthorizedHandler = () => void

let unauthorizedHandler: UnauthorizedHandler | null = null
const DEFAULT_TIMEOUT_MS = 15000

export function setUnauthorizedHandler(handler: UnauthorizedHandler): void {
  unauthorizedHandler = handler
}

interface RequestOptions extends Omit<RequestInit, 'signal'> {
  timeoutMs?: number
  skipUnauthorizedHandler?: boolean
}

export async function request<T>(url: string, options: RequestOptions = {}): Promise<T> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, skipUnauthorizedHandler, ...init } = options
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  const headers = new Headers(init.headers)
  if (init.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  let response: Response
  try {
    response = await fetch(url, { ...init, headers, credentials: 'include', signal: controller.signal })
  } catch (err) {
    const aborted = err instanceof DOMException && err.name === 'AbortError'
    throw new ApiError(0, aborted ? '请求超时，请稍后重试' : '网络连接异常，请检查服务状态', aborted ? 'timeout' : 'network')
  } finally {
    clearTimeout(timer)
  }

  const payload = (await response.json().catch(() => null)) as ApiEnvelope<T> | null

  if (response.status === 401) {
    if (!skipUnauthorizedHandler) unauthorizedHandler?.()
    throw new ApiError(401, payload?.error || '未授权或登录已过期')
  }

  if (!response.ok || !payload?.success) {
    throw new ApiError(response.status, payload?.error || `请求失败 (${response.status})`)
  }

  return payload.data as T
}

export const http = {
  get: <T>(url: string, options?: RequestOptions) => request<T>(url, { ...options, method: 'GET' }),
  post: <T>(url: string, body?: unknown, options?: RequestOptions) =>
    request<T>(url, {
      ...options,
      method: 'POST',
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
}
