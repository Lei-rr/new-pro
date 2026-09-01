import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { createLogger } from '../core/logger.js';
import { loadConfig } from '../config/env.js';

const log = createLogger('auth');

/** Paths that never require auth (health checks / probes / metrics scrape). */
const OPEN_PATHS = ['/api/health', '/api/v1/health', '/api/metrics', '/api/v1/metrics'];

let cachedKeys: string[] | null = null;

/** Load configured API keys (comma-separated), parsed once at startup. */
export function loadApiKeys(): string[] {
  if (cachedKeys === null) {
    cachedKeys = loadConfig().API_KEYS.split(',').map((k) => k.trim()).filter(Boolean);
  }
  return cachedKeys;
}

/** Constant-time string comparison (avoids timing attacks). */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/** Check a presented token against the configured keys. */
export function isValidToken(token: string | undefined, keys: string[]): boolean {
  if (keys.length === 0) return true; // auth disabled
  return token !== undefined && keys.some((k) => constantTimeEqual(k, token));
}

/** Extract an API key from Authorization (Bearer) or X-API-Key headers. */
export function extractApiKey(headers: FastifyRequest['headers']): string | undefined {
  const raw = headers.authorization ?? headers['x-api-key'];
  if (raw === undefined) return undefined;
  const value = Array.isArray(raw) ? raw[0] : String(raw);
  if (value.startsWith('Bearer ')) return value.slice(7).trim();
  return value.trim();
}

/**
 * Extract an API key from the WebSocket subprotocol 'api_key.<token>'.
 * Preferred over the query string so keys don't leak into access logs.
 */
export function extractWsApiKey(headers: FastifyRequest['headers']): string | undefined {
  const proto = headers['sec-websocket-protocol'];
  if (typeof proto !== 'string') return undefined;
  for (const part of proto.split(',')) {
    const p = part.trim();
    if (p.startsWith('api_key.')) return p.slice('api_key.'.length).trim();
  }
  return undefined;
}

function isOpenPath(url: string): boolean {
  const path = url.split('?')[0];
  return OPEN_PATHS.some((p) => path === p || path.startsWith(`${p}/`));
}

/** Register API key auth as a global onRequest hook (HTTP). */
export function registerAuth(app: FastifyInstance): void {
  const keys = loadApiKeys();
  if (keys.length === 0) {
    log.warn('API_KEYS not configured: authentication disabled');
    return;
  }
  log.info({ count: keys.length }, 'API key authentication enabled');

  app.addHook('onRequest', async (request, reply) => {
    if (request.method === 'OPTIONS') return; // allow CORS preflight
    if (!request.url.startsWith('/api/') || isOpenPath(request.url)) return;
    if (!isValidToken(extractApiKey(request.headers), keys)) {
      return reply.code(401).send({ error: 'Unauthorized', statusCode: 401 });
    }
  });
}

/** preValidation guard for the WebSocket route. */
export async function requireWsAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const keys = loadApiKeys();
  if (keys.length === 0) return; // auth disabled
  // Subprotocol first; fall back to query/header for legacy clients.
  const token = extractWsApiKey(request.headers)
    ?? (typeof (request.query as Record<string, unknown>).api_key === 'string'
      ? (request.query as Record<string, unknown>).api_key as string
      : extractApiKey(request.headers));
  if (!isValidToken(token, keys)) {
    await reply.code(401).send({ error: 'Unauthorized', statusCode: 401 });
  }
}
