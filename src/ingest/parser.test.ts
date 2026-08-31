import { describe, expect, it } from 'vitest';
import { parseLine, parseLines } from './parser.js';
import { isConsume, isGin, isError } from '../types/log.js';

const CONSUME_LINE = '[INFO] 2026/08/27 - 09:11:47 | abc-123 | record consume log: userId=42, params={"channel_id":1,"prompt_tokens":100,"completion_tokens":50,"model_name":"gpt-4","token_name":"tk-1","quota":150000,"content":"","token_id":1,"use_time_seconds":1.5,"is_stream":false,"group":"default","other":{"frt":200,"cache_tokens":10}}';

const GIN_LINE = '[GIN] 2026/08/27 - 09:11:47 | relay | abc-123 | 200 | 1.2s | 1.2.3.4 | POST /v1/chat/completions';

describe('parseLine', () => {
  it('parses consume lines with local timestamps', () => {
    const entry = parseLine(CONSUME_LINE, 'oneapi-2026-08-27.log');
    expect(entry).not.toBeNull();
    if (!entry || !isConsume(entry)) throw new Error('expected consume entry');
    expect(entry.userId).toBe(42);
    expect(entry.params.model_name).toBe('gpt-4');
    expect(entry.params.quota).toBe(150000);
    // Wall-clock components parsed into Date
    expect(entry.timestamp.getFullYear()).toBe(2026);
    expect(entry.timestamp.getMonth()).toBe(7); // 0-indexed August
    expect(entry.timestamp.getDate()).toBe(27);
    expect(entry.timestamp.getHours()).toBe(9);
    expect(entry.timestamp.getMinutes()).toBe(11);
    expect(entry.timestamp.getSeconds()).toBe(47);
  });

  it('parses GIN lines', () => {
    const entry = parseLine(GIN_LINE, 'oneapi-2026-08-27.log');
    expect(entry).not.toBeNull();
    if (!entry || !isGin(entry)) throw new Error('expected gin entry');
    expect(entry.routeType).toBe('relay');
    expect(entry.statusCode).toBe(200);
    expect(entry.durationMs).toBe(1200);
    expect(entry.ip).toBe('1.2.3.4');
  });

  it('parses ERR lines', () => {
    const entry = parseLine('[ERR] 2026/08/27 - 09:11:48 | xyz | something broke', 'oneapi-2026-08-27.log');
    expect(entry).not.toBeNull();
    if (!entry || !isError(entry)) throw new Error('expected error entry');
    expect(entry.requestId).toBe('xyz');
    expect(entry.message).toBe('something broke');
  });

  it('returns null for garbage and empty lines', () => {
    expect(parseLine('garbage line', 'f.log')).toBeNull();
    expect(parseLine('', 'f.log')).toBeNull();
  });

  it('parses multiple lines, skipping unparseable ones', () => {
    const entries = parseLines(
      `${CONSUME_LINE}\nnot a log\n[ERR] 2026/08/27 - 09:11:48 | xyz | oops`,
      'f.log',
    );
    expect(entries).toHaveLength(2);
  });
});
