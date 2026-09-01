import { describe, expect, it } from 'vitest';
import { constantTimeEqual, extractApiKey, extractWsApiKey, isValidToken } from './auth.js';
import type { FastifyRequest } from 'fastify';

describe('auth helpers', () => {
  it('constant-time comparison', () => {
    expect(constantTimeEqual('abc', 'abc')).toBe(true);
    expect(constantTimeEqual('abc', 'abd')).toBe(false);
    expect(constantTimeEqual('abc', 'abcd')).toBe(false);
    expect(constantTimeEqual('', '')).toBe(true);
  });

  it('extracts API key from headers', () => {
    const headers = (o: Record<string, string>) => o as FastifyRequest['headers'];
    expect(extractApiKey(headers({ authorization: 'Bearer sekret' }))).toBe('sekret');
    expect(extractApiKey(headers({ 'x-api-key': 'sekret2' }))).toBe('sekret2');
    expect(extractApiKey(headers({}))).toBeUndefined();
  });

  it('validates tokens against configured keys', () => {
    const keys = ['k1', 'k2'];
    expect(isValidToken('k1', keys)).toBe(true);
    expect(isValidToken('k2', keys)).toBe(true);
    expect(isValidToken('bad', keys)).toBe(false);
    expect(isValidToken(undefined, keys)).toBe(false);
  });

  it('auth is open when no keys configured', () => {
    expect(isValidToken(undefined, [])).toBe(true);
    expect(isValidToken('anything', [])).toBe(true);
  });

  it('extracts the API key from the websocket subprotocol', () => {
    const headers = (o: Record<string, string>) => o as FastifyRequest['headers'];
    expect(extractWsApiKey(headers({ 'sec-websocket-protocol': 'api_key.sekret' }))).toBe('sekret');
    expect(extractWsApiKey(headers({ 'sec-websocket-protocol': 'graphql-transport-ws, api_key.sekret' }))).toBe('sekret');
    expect(extractWsApiKey(headers({}))).toBeUndefined();
    expect(extractWsApiKey(headers({ 'sec-websocket-protocol': 'other' }))).toBeUndefined();
  });
});
