import { describe, expect, it } from 'vitest';
import { RequestCorrelator } from './correlation.js';
import { ReplayGuard, identityOf } from './dedup.js';
import type { ConsumeLogEntry, GinLogEntry } from '../types/log.js';

function consume(requestId: string): ConsumeLogEntry {
  return {
    level: 'INFO',
    kind: 'consume',
    timestamp: new Date('2026-08-27 09:11:47'),
    requestId,
    userId: 1,
    params: {
      channel_id: 1,
      prompt_tokens: 10,
      completion_tokens: 5,
      model_name: 'gpt-4',
      token_name: 'tk',
      quota: 100,
      content: '',
      token_id: 1,
      use_time_seconds: 1,
      is_stream: false,
      group: 'default',
      other: {},
    },
    sourceFile: 'f.log',
  };
}

function gin(requestId: string, ip: string): GinLogEntry {
  return {
    level: 'GIN',
    timestamp: new Date('2026-08-27 09:11:46'),
    routeType: 'relay',
    requestId,
    statusCode: 200,
    duration: '1s',
    durationMs: 1000,
    ip,
    method: 'POST',
    path: '/v1/chat',
    sourceFile: 'f.log',
  };
}

describe('RequestCorrelator', () => {
  it('correlates when GIN arrives first', () => {
    const c = new RequestCorrelator();
    expect(c.onGin('req-1', '1.2.3.4')).toBeUndefined();
    expect(c.onConsume(consume('req-1'))).toBe('1.2.3.4');
  });

  it('correlates when consume arrives first', () => {
    const c = new RequestCorrelator();
    expect(c.onConsume(consume('req-2'))).toBeUndefined();
    const matched = c.onGin('req-2', '5.6.7.8');
    expect(matched).toBeDefined();
    expect(matched!.ip).toBe('5.6.7.8');
  });

  it('leaves unrelated requests uncorrelated', () => {
    const c = new RequestCorrelator();
    c.onGin('req-a', '1.1.1.1');
    expect(c.onConsume(consume('req-b'))).toBeUndefined();
  });
});

describe('ReplayGuard', () => {
  it('detects replayed entries by identity', () => {
    const guard = new ReplayGuard();
    const g = gin('r1', '1.2.3.4');
    expect(identityOf(g)).toBe('gin|r1');
    expect(guard.checkAndRemember(g)).toBe(false);
    expect(guard.checkAndRemember(g)).toBe(true);
    // GIN and consume of the same request are distinct identities
    expect(guard.checkAndRemember(consume('r1'))).toBe(false);
  });
});
