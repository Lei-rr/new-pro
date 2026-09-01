import { describe, expect, it } from 'vitest';
import { KIND_TO_TYPES, DIMENSION_COLUMNS, timelineStep, LogType } from '../../shared/constants.js';
import { LogsService } from './logs.service.js';
import type { LogsRepository } from './logs.repo.js';
import type { LogRow } from './logs.types.js';

describe('KIND_TO_TYPES', () => {
  it('maps stream kinds to log types', () => {
    expect(KIND_TO_TYPES.all).toEqual([2, 3, 5, 7]);
    expect(KIND_TO_TYPES.consume).toEqual([2]);
    expect(KIND_TO_TYPES.error).toEqual([5]);
    expect(KIND_TO_TYPES.sys).toEqual([3, 7]);
  });
});

describe('DIMENSION_COLUMNS', () => {
  it('maps dimensions to SQL columns', () => {
    expect(DIMENSION_COLUMNS.model).toBe('model_name');
    expect(DIMENSION_COLUMNS.group).toBe('"group"');
    expect(DIMENSION_COLUMNS.user).toBe('user_id::text');
  });
});

describe('timelineStep', () => {
  it('picks bucket size by window length', () => {
    expect(timelineStep(1)).toBe(3600);
    expect(timelineStep(7)).toBe(7200);
    expect(timelineStep(30)).toBe(21600);
    expect(timelineStep(90)).toBe(43200);
  });
});

describe('LogsService.toDtos', () => {
  it('maps rows to DTOs with correct kind/success', () => {
    const repo = {} as LogsRepository;
    const service = new LogsService(repo);
    const rows: LogRow[] = [
      {
        id: '1', created_at: 1788250000, type: 2, model_name: 'gpt-4',
        channel_id: 1, channel_name: null, quota: 100, prompt_tokens: 10,
        completion_tokens: 5, is_stream: true, ip: null, request_id: 'r1',
        username: 'alice', token_name: 'tk1', group: 'default', content: null,
      },
      {
        id: '2', created_at: 1788250001, type: 5, model_name: 'gpt-4',
        channel_id: 2, channel_name: null, quota: 0, prompt_tokens: 0,
        completion_tokens: 0, is_stream: false, ip: null, request_id: 'r2',
        username: 'alice', token_name: 'tk1', group: 'default',
        content: 'status_code=429',
      },
    ];
    const dtos = service.toDtos(rows);
    expect(dtos).toHaveLength(2);
    expect(dtos[0].kind).toBe('consume');
    expect(dtos[0].success).toBe(true);
    expect(dtos[0].typeLabel).toBe('计费');
    expect(dtos[1].kind).toBe('error');
    expect(dtos[1].success).toBe(false);
    expect(dtos[1].message).toBe('status_code=429');
  });
});
