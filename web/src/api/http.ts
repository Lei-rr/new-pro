const API_KEY = import.meta.env.VITE_API_KEY as string | undefined;
const API_BASE = import.meta.env.VITE_API_BASE as string | undefined;

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function request<T>(
  path: string,
  params?: Record<string, string | number | undefined>,
): Promise<T> {
  const base = API_BASE || window.location.origin;
  const url = new URL(path, base);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
    }
  }

  const headers: Record<string, string> = {};
  if (API_KEY) headers.Authorization = `Bearer ${API_KEY}`;

  const res = await fetch(url.toString(), { headers });
  if (!res.ok) {
    throw new ApiError(res.status, `API ${res.status}: ${path}`);
  }
  return res.json() as Promise<T>;
}

export function wsUrl(): string {
  const raw =
    (import.meta.env.VITE_WS_URL as string | undefined) ||
    `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`;
  return new URL(raw, window.location.href).toString();
}

/** WebSocket 子协议携带 API Key（不暴露在 URL/日志中） */
export function wsProtocols(): string[] {
  return API_KEY ? [`api_key.${API_KEY}`] : [];
}
