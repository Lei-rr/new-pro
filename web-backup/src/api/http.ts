const API_KEY = import.meta.env.VITE_API_KEY as string | undefined;
const API_BASE = import.meta.env.VITE_API_BASE as string | undefined;

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
    throw new Error(`API ${res.status}: ${path}`);
  }
  return res.json() as Promise<T>;
}

export function wsUrl(): string {
  const raw =
    (import.meta.env.VITE_WS_URL as string | undefined) ||
    `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`;
  const url = new URL(raw, window.location.href);
  if (API_KEY) url.searchParams.set('api_key', API_KEY);
  return url.toString();
}

/** WebSocket subprotocols carrying the API key (kept out of the URL/access logs). */
export function wsProtocols(): string[] {
  return API_KEY ? [`api_key.${API_KEY}`] : [];
}
