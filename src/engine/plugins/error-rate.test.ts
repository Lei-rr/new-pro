import { describe, expect, it } from 'vitest';
import { ErrorRatePlugin } from './error-rate.js';
import type { ConsumeLogEntry, GinLogEntry } from '../../types/log.js';

function consume(requestId: string, timestamp: Date): ConsumeLogEntry {
  return {
    level: 'INFO',
    kind: 'consume',
    timestamp,
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

function gin(statusCode: number, timestamp: Date): GinLogEntry {
  return {
    level: 'GIN',
    timestamp,
    routeType: 'relay',
    requestId: `gin-${Math.random()}`,
    statusCode,
    duration: '1s',
    durationMs: 1000,
    ip: '1.2.3.4',
    method: 'POST',
    path: '/v1/chat',
    sourceFile: 'f.log',
  };
}

describe('ErrorRatePlugin', () => {
  it('fires when the error rate in the sliding window exceeds the threshold', () => {
    const plugin = new ErrorRatePlugin();
    const now = Date.now();
    const recent = new Date(now - 60_000);
    for (let i = 0; i < 10; i++) plugin.ingest(consume(`ok-${i}`, recent));
    for (let i = 0; i < 6; i++) plugin.ingest(gin(500, recent));

    const alerts = plugin.checkAlerts();
    expect(alerts).toHaveLength(1);
    expect(alerts[0].ruleId).toBe('error-rate');
  });

  it('ignores events outside the 5-minute window', () => {
    const plugin = new ErrorRatePlugin();
    const stale = new Date(Date.now() - 6 * 60_000);
    for (let i = 0; i < 10; i++) plugin.ingest(consume(`stale-ok-${i}`, stale));
    for (let i = 0; i < 6; i++) plugin.ingest(gin(500, stale));

    expect(plugin.checkAlerts()).toHaveLength(0);
    expect(plugin.getSummary().recentRequests).toBe(0);
  });
});
