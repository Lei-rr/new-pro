import { describe, expect, it } from 'vitest';
import { MemoryStore } from './memory.js';
import type { ConsumeLogEntry, GinLogEntry, ErrorLogEntry } from '../types/log.js';

function consume(opts: {
  requestId?: string;
  userId?: number;
  timestamp?: Date;
  model?: string;
  quota?: number;
  tokenName?: string;
} = {}): ConsumeLogEntry {
  return {
    level: 'INFO',
    kind: 'consume',
    timestamp: opts.timestamp ?? new Date('2026-08-27 09:11:47'),
    requestId: opts.requestId ?? 'req-1',
    userId: opts.userId ?? 42,
    params: {
      channel_id: 1,
      prompt_tokens: 100,
      completion_tokens: 50,
      model_name: opts.model ?? 'gpt-4',
      token_name: opts.tokenName ?? 'tk-1',
      quota: opts.quota ?? 150_000,
      content: '',
      token_id: 1,
      use_time_seconds: 1.5,
      is_stream: false,
      group: 'default',
      other: { frt: 200, cache_tokens: 10 },
    },
    sourceFile: 'f.log',
  };
}

function gin(opts: {
  requestId?: string;
  ip?: string;
  statusCode?: number;
  timestamp?: Date;
  durationMs?: number;
} = {}): GinLogEntry {
  return {
    level: 'GIN',
    timestamp: opts.timestamp ?? new Date('2026-08-27 09:11:46'),
    routeType: 'relay',
    requestId: opts.requestId ?? 'req-1',
    statusCode: opts.statusCode ?? 200,
    duration: '1.2s',
    durationMs: opts.durationMs ?? 1200,
    ip: opts.ip ?? '1.2.3.4',
    method: 'POST',
    path: '/v1/chat/completions',
    sourceFile: 'f.log',
  };
}

function error(timestamp?: Date): ErrorLogEntry {
  return {
    level: 'ERR',
    timestamp: timestamp ?? new Date('2026-08-27 09:12:00'),
    requestId: 'req-e',
    message: 'boom',
    sourceFile: 'f.log',
  };
}

describe('MemoryStore', () => {
  it('accumulates summary counters monotonically and accurately', () => {
    const store = new MemoryStore();
    store.append(gin({ requestId: 'req-1' }));
    store.append(consume({ requestId: 'req-1', quota: 150_000 }));
    store.append(gin({ requestId: 'req-2' }));
    store.append(consume({ requestId: 'req-2', quota: 350_000, userId: 7, model: 'gpt-3.5' }));

    const s = store.getSummary();
    expect(s.totalRequests).toBe(2);
    expect(s.billingRequests).toBe(2);
    expect(s.totalQuota).toBe(500_000);
    expect(s.totalCost).toBe(1);
    expect(s.totalPromptTokens).toBe(200);
    expect(s.activeModels).toBe(2);
    expect(s.activeUsers).toBe(2);
  });

  it('computes errorRate from GIN status >= 400 over total HTTP requests', () => {
    const store = new MemoryStore();
    store.append(gin({ requestId: 'req-1', statusCode: 200 }));
    store.append(gin({ requestId: 'req-2', statusCode: 500 }));
    store.append(consume({ requestId: 'req-1' }));
    store.append(error()); // ERR log recorded as diagnostic line

    const s = store.getSummary();
    expect(s.totalRequests).toBe(2);
    expect(s.errorCount).toBe(1);
    expect(s.errorLogCount).toBe(1);
    expect(s.errorRate).toBe(0.5);
  });

  it('builds hourly timeline buckets with HTTP requests and errors', () => {
    const store = new MemoryStore();
    const t1 = new Date(Date.now() - 2 * 3600_000);
    const t2 = new Date(Date.now() - 3600_000);

    store.append(gin({ timestamp: t1, requestId: 'r1' }));
    store.append(consume({ timestamp: t1, requestId: 'r1' }));
    store.append(gin({ timestamp: t2, requestId: 'r2', statusCode: 500 }));
    store.append(consume({ timestamp: t2, requestId: 'r2' }));

    const timeline = store.getTimeline(24);
    expect(timeline).toHaveLength(2);
    expect(timeline[0].requests).toBe(1);
    expect(timeline[0].quota).toBe(150_000);
    expect(timeline[1].errors).toBe(1);
  });

  it('returns dimension stats with pagination', () => {
    const store = new MemoryStore();
    store.append(consume({ requestId: 'a' }));
    store.append(consume({ requestId: 'b', userId: 8 }));
    store.append(consume({ requestId: 'c', userId: 9 }));

    const res = store.getDimensionStats('model', { sort: 'requests', limit: 2, offset: 0 });
    expect(res.total).toBe(1);
    expect(res.data[0].key).toBe('gpt-4');
    expect(res.data[0].requests).toBe(3);
  });

  it('bidirectionally correlates GIN relay IP to consume entries for IP dimension stats', () => {
    const store = new MemoryStore();
    // Consume arrives before GIN (standard Go middleware flow)
    store.append(consume({ requestId: 'req-1', quota: 100_000 }));
    store.append(gin({ requestId: 'req-1', ip: '1.2.3.4' }));

    // GIN arrives before consume
    store.append(gin({ requestId: 'req-2', ip: '5.6.7.8' }));
    store.append(consume({ requestId: 'req-2', quota: 200_000, model: 'gpt-3.5' }));

    const byIp = store.searchLogs({ ip: '1.2.3.4' });
    expect(byIp.total).toBe(1);
    expect(byIp.data[0].requestId).toBe('req-1');

    const ips = store.getDimensionStats('ip');
    expect(ips.total).toBe(2);
    const ip1 = ips.data.find((d) => d.key === '1.2.3.4');
    expect(ip1).toBeDefined();
    expect(ip1!.quota).toBe(100_000);
    expect(ip1!.cost).toBe(0.2);
  });

  it('searches logs with offset and limit pagination', () => {
    const store = new MemoryStore();
    store.append(consume({ requestId: 'r1', model: 'gpt-4' }));
    store.append(consume({ requestId: 'r2', model: 'gpt-4' }));
    store.append(consume({ requestId: 'r3', model: 'gpt-3.5' }));

    const page1 = store.searchLogs({ model: 'gpt-4', limit: 1, offset: 0 });
    expect(page1.total).toBe(2);
    expect(page1.data).toHaveLength(1);
    expect(page1.data[0].requestId).toBe('r2');

    const page2 = store.searchLogs({ model: 'gpt-4', limit: 1, offset: 1 });
    expect(page2.total).toBe(2);
    expect(page2.data).toHaveLength(1);
    expect(page2.data[0].requestId).toBe('r1');
  });

  it('builds daily cost trend in ascending order', () => {
    const store = new MemoryStore();
    store.append(consume({ timestamp: new Date('2026-08-27 09:00:00') }));
    store.append(consume({ requestId: 'req-2', timestamp: new Date('2026-08-28 09:00:00') }));

    const trend = store.getCostTrend(7);
    expect(trend).toHaveLength(2);
    expect(trend[0].date).toBe('2026-08-27');
    expect(trend[1].date).toBe('2026-08-28');
    expect(trend[1].cost).toBe(0.3);
  });

  it('counts each relay request exactly once in the IP dimension', () => {
    const store = new MemoryStore();
    // GIN first, consume second (regression: used to double count)
    store.append(gin({ requestId: 'req-a', ip: '1.2.3.4', durationMs: 1200 }));
    store.append(consume({ requestId: 'req-a', quota: 100_000 }));
    // consume first, GIN second
    store.append(consume({ requestId: 'req-b', quota: 200_000 }));
    store.append(gin({ requestId: 'req-b', ip: '1.2.3.4', durationMs: 800 }));

    const ips = store.getDimensionStats('ip');
    expect(ips.total).toBe(1);
    const ip = ips.data.find((d) => d.key === '1.2.3.4');
    expect(ip).toBeDefined();
    expect(ip!.requests).toBe(2);
    expect(ip!.quota).toBe(300_000);
    // avgResponseTime uses GIN duration caliber: (1200 + 800) / 2 / 1000 s
    expect(ip!.avgResponseTime).toBeCloseTo(1.0);
  });

  it('counts client_gone once per logical cancel (consume is the single source)', () => {
    const store = new MemoryStore();
    const c = consume({ requestId: 'req-1' });
    c.params.is_stream = true;
    c.params.other = { ...c.params.other, stream_status: { end_reason: 'client_gone' } };
    store.append(c);
    // ERR line describing the same cancellation must not increment again
    store.append({ ...error(), message: 'stream closed: client_gone' });

    const s = store.getSummary();
    expect(s.clientGoneCount).toBe(1);
  });

  it('ignores replayed entries (requestId dedup guard)', () => {
    const store = new MemoryStore();
    store.append(consume({ requestId: 'r1', quota: 100_000 }));
    store.append(consume({ requestId: 'r1', quota: 100_000 }));
    store.append(gin({ requestId: 'r1' }));
    store.append(gin({ requestId: 'r1' }));

    const s = store.getSummary();
    expect(s.billingRequests).toBe(1);
    expect(s.totalRequests).toBe(1);
    expect(s.totalQuota).toBe(100_000);
  });

  it('keeps a raw stream of every parsed line (no dedup in viewer)', () => {
    const store = new MemoryStore();
    store.append(consume({ requestId: 'r1', model: 'gpt-4' }));
    store.append(gin({ requestId: 'r1', statusCode: 200 }));
    store.append(gin({ requestId: 'r2', statusCode: 500 }));
    store.append({ ...error(), message: 'boom' });

    const all = store.getRawLogs({ limit: 50 });
    expect(all.total).toBe(4);
    expect(all.data).toHaveLength(4);
    // 最新在前
    expect(all.data[0].message).toBe('boom');

    const failures = store.getRawLogs({ kind: 'failure', limit: 50 });
    expect(failures.total).toBe(2); // 500 GIN + ERR

    const successes = store.getRawLogs({ kind: 'success', limit: 50 });
    expect(successes.total).toBe(2); // consume + 200 GIN
  });

  it('aggregates windowed summary from buckets only (no global fallbacks)', () => {
    const store = new MemoryStore();
    // Align to a local hour boundary so hour-bucket granularity is deterministic
    const localHourStart = new Date();
    localHourStart.setMinutes(0, 0, 0);
    const hourStartMs = localHourStart.getTime();
    const tIn = new Date(hourStartMs + 10 * 60_000);
    const tOut = new Date(hourStartMs - 3 * 3600_000 + 10 * 60_000);
    const startMs = hourStartMs - 3600_000;
    const endMs = hourStartMs + 3600_000;

    store.append(gin({ requestId: 'r1', ip: '1.1.1.1', timestamp: tIn, durationMs: 1000 }));
    store.append(consume({ requestId: 'r1', timestamp: tIn }));
    store.append({ ...error(tIn), message: 'oops' });
    store.append(gin({ requestId: 'r2', ip: '2.2.2.2', timestamp: tOut }));
    store.append(consume({ requestId: 'r2', timestamp: tOut }));

    const s = store.getSummary(startMs, endMs);
    expect(s.totalRequests).toBe(1);
    expect(s.errorLogCount).toBe(1);
    expect(s.activeIps).toBe(1);
    // windowed avgResponseTime = ginDurationMs / requests / 1000
    expect(s.avgResponseTime).toBeCloseTo(1.0);
    expect(s.firstEntry).not.toBeNull();
    expect(s.lastEntry).not.toBeNull();
  });

  it('sliding 1h window excludes entries older than the boundary (minute buckets)', () => {
    const store = new MemoryStore();
    const now = Date.now();
    // 61 分钟前：必须在窗口外
    store.append(gin({ requestId: 'old', ip: '9.9.9.9', timestamp: new Date(now - 61 * 60_000) }));
    store.append(consume({ requestId: 'old', timestamp: new Date(now - 61 * 60_000) }));
    // 10 分钟前：必须在窗口内
    store.append(gin({ requestId: 'new', ip: '8.8.8.8', timestamp: new Date(now - 10 * 60_000) }));
    store.append(consume({ requestId: 'new', timestamp: new Date(now - 10 * 60_000) }));

    const s = store.getSummary(now - 60 * 60_000, now);
    expect(s.totalRequests).toBe(1);
    expect(s.billingRequests).toBe(1);
  });
});
