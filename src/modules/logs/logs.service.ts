import { loadConfig } from '../../config/env.js';
import { startOfDayMs } from '../../shared/time.js';
import { KIND_TO_TYPES, LogType } from '../../shared/constants.js';
import type { LogsRepository } from './logs.repo.js';
import type { LogEntryDto, LogRow, LogStreamResponse } from './logs.types.js';

/** 日志服务：窗口计算 + 行→DTO 映射（无 SQL） */
export class LogsService {
  constructor(private repo: LogsRepository) {}

  private dayRange(days: number): { startSec: number; endSec: number } {
    const config = loadConfig();
    const now = Date.now();
    const startMs = startOfDayMs(now, config.LOG_TZ, days - 1);
    return { startSec: Math.floor(startMs / 1000), endSec: Math.floor(now / 1000) };
  }

  async stream(
    days: number,
    kind: string,
    q: string | undefined,
    limit: number,
    offset: number,
  ): Promise<LogStreamResponse> {
    const range = this.dayRange(days);
    const types = KIND_TO_TYPES[kind] ?? KIND_TO_TYPES.all;
    // 空串视为未搜索（前端空输入会传 ''）
    const search = q && q.trim().length > 0 ? q : undefined;
    const res = await this.repo.stream(range.startSec, range.endSec, types, search, limit, offset);
    return {
      total: res.total,
      count: res.rows.length,
      offset,
      limit,
      data: res.rows.map(logRowToDto),
    };
  }

  /** 增量行 → DTO（WS 推送） */
  toDtos(rows: LogRow[]): LogEntryDto[] {
    return rows.map(logRowToDto);
  }
}

function logRowToDto(r: LogRow): LogEntryDto {
  const type = Number(r.type);
  const success = type !== LogType.Error;
  let message = r.content ?? '';
  if (type === LogType.Consume) {
    message = `消耗记录 userId=${r.username ?? '?'} model=${r.model_name ?? '?'} tokens=${r.prompt_tokens}+${r.completion_tokens} quota=${r.quota}`;
  }
  return {
    id: r.id,
    timestamp: Number(r.created_at) * 1000,
    type,
    typeLabel: type === LogType.Consume ? '计费' : type === LogType.Error ? '错误' : '系统',
    kind: type === LogType.Consume ? 'consume' : type === LogType.Error ? 'error' : 'sys',
    success,
    model: r.model_name,
    channelId: r.channel_id,
    channelName: r.channel_name,
    quota: Number(r.quota),
    promptTokens: Number(r.prompt_tokens),
    completionTokens: Number(r.completion_tokens),
    isStream: r.is_stream ?? false,
    requestId: r.request_id,
    username: r.username,
    tokenName: r.token_name,
    group: r.group,
    message,
  };
}
