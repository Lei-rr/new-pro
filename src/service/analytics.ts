import { QUOTA_PER_COST_UNIT } from '../constants.js';
import { getEnv } from '../env.js';
import { startOfDayMs } from '../utils/time.js';
import type { LogRow, OverviewAgg, PgStore } from '../db/pg-store.js';

/** API 层的分析服务：SQL 查询 → 前端 DTO。所有窗口按自然日对齐。 */
export class AnalyticsService {
  constructor(private pg: PgStore) {}

  private dayRange(days: number): { startSec: number; endSec: number } {
    const tz = getEnv().LOG_TZ ?? 'local';
    const now = Date.now();
    const startMs = startOfDayMs(now, tz, days - 1);
    return { startSec: Math.floor(startMs / 1000), endSec: Math.floor(now / 1000) };
  }

  // ─── 总览 ───

  async getSummary(start?: number, end?: number): Promise<OverviewSummaryDto> {
    const range = start !== undefined && end !== undefined
      ? { startSec: Math.floor(start / 1000), endSec: Math.floor(end / 1000) }
      : this.dayRange(getEnv().DEFAULT_RANGE_DAYS);
    const a: OverviewAgg = await this.pg.getSummary(range.startSec, range.endSec);
    // PG 数据源没有 GIN 网关日志：请求总数 = 计费请求数
    const requests = a.consumes;
    const errors = a.errors;
    return {
      totalRequests: requests,
      billingRequests: a.consumes,
      totalPromptTokens: a.promptTokens,
      totalCompletionTokens: a.completionTokens,
      totalQuota: a.quota,
      totalCost: a.quota / QUOTA_PER_COST_UNIT,
      errorCount: errors,
      errorLogCount: a.errorLogs,
      errorRate: requests > 0 ? errors / requests : 0,
      cacheHitRate: 0,
      streamRatio: a.consumes > 0 ? a.streamCount / a.consumes : 0,
      clientGoneCount: a.clientGone,
      activeModels: a.models,
      activeChannels: a.channels,
      activeUsers: a.users,
      activeTokens: a.tokens,
      activeIps: 0,
      activeGroups: a.groups,
      avgResponseTime: a.consumes > 0 ? a.useTime / a.consumes : 0,
      avgFrt: a.frtCount > 0 ? a.frtSum / a.frtCount : 0,
      cacheHitTokens: a.cacheTokens,
      firstEntry: a.firstEntry,
      lastEntry: a.lastEntry,
      uptimeSeconds: process.uptime(),
    };
  }

  async getTimeline(days: number): Promise<TimelineDto[]> {
    const range = this.dayRange(days);
    // 步长：1天用1小时，7天用2小时，30天用6小时，更长用12小时
    const stepSec = days <= 2 ? 3600 : days <= 7 ? 7200 : days <= 30 ? 21_600 : 43_200;
    const rows = await this.pg.getTimeline(range.startSec, range.endSec, stepSec);
    return rows.map((r) => ({
      time: new Date(Number(r.bucket) * 1000).toISOString(),
      requests: Number(r.requests),
      promptTokens: Number(r.prompt_tokens),
      completionTokens: Number(r.completion_tokens),
      quota: Number(r.quota),
      errors: 0,
      models: Number(r.models),
      users: Number(r.users),
    }));
  }

  // ─── 维度 ───

  async getDimension(
    dimension: 'model' | 'channel' | 'token' | 'user' | 'group',
    days: number,
    sort: string,
    limit: number,
    offset: number,
  ): Promise<{ total: number; data: DimensionDto[] }> {
    const range = this.dayRange(days);
    const res = await this.pg.getDimension(dimension, range.startSec, range.endSec, sort, limit, offset);
    return {
      total: res.total,
      data: res.data.map((r) => ({
        key: r.key,
        requests: Number(r.requests),
        promptTokens: Number(r.promptTokens),
        completionTokens: Number(r.completionTokens),
        totalTokens: Number(r.promptTokens) + Number(r.completionTokens),
        quota: Number(r.quota),
        cost: Number(r.quota) / QUOTA_PER_COST_UNIT,
        errors: Number(r.errors),
        avgResponseTime: Number(r.requests) > 0 ? Number(r.totalTime) / Number(r.requests) : 0,
        avgFrt: Number(r.frtCount) > 0 ? Number(r.totalFrt) / Number(r.frtCount) : 0,
        cacheTokens: Number(r.cacheTokens),
        firstSeen: Number(r.firstSeen) * 1000,
        lastSeen: Number(r.lastSeen) * 1000,
      })),
    };
  }

  // ─── 日志流 ───

  async getLogsStream(
    days: number,
    kind: string,
    _q: string | undefined,
    limit: number,
    offset: number,
  ): Promise<{ total: number; data: LogDto[] }> {
    const range = this.dayRange(days);
    const types = kindToTypes(kind);
    const res = await this.pg.getLogsStream(range.startSec, range.endSec, types, limit, offset);
    return {
      total: res.total,
      data: res.data.map(logRowToDto),
    };
  }

  /** 把轮询新行转成 WS 推送 DTO */
  toLogDtos(rows: LogRow[]): LogDto[] {
    return rows.map(logRowToDto);
  }
}

// ─── DTO 映射 ───

export interface OverviewSummaryDto {
  totalRequests: number;
  billingRequests: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalQuota: number;
  totalCost: number;
  errorCount: number;
  errorLogCount: number;
  errorRate: number;
  cacheHitRate: number;
  streamRatio: number;
  clientGoneCount: number;
  activeModels: number;
  activeChannels: number;
  activeUsers: number;
  activeTokens: number;
  activeIps: number;
  activeGroups: number;
  avgResponseTime: number;
  avgFrt: number;
  cacheHitTokens: number;
  firstEntry: number | null;
  lastEntry: number | null;
  uptimeSeconds: number;
}

export interface TimelineDto {
  time: string;
  requests: number;
  promptTokens: number;
  completionTokens: number;
  quota: number;
  errors: number;
  models: number;
  users: number;
}

export interface DimensionDto {
  key: string;
  requests: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  quota: number;
  cost: number;
  errors: number;
  avgResponseTime: number;
  avgFrt: number;
  cacheTokens: number;
  firstSeen: number;
  lastSeen: number;
}

export interface LogDto {
  id: string;
  timestamp: number;
  type: number;
  typeLabel: string;
  kind: 'consume' | 'error' | 'sys' | 'info';
  success: boolean;
  model: string | null;
  channelId: number | null;
  channelName: string | null;
  quota: number;
  promptTokens: number;
  completionTokens: number;
  isStream: boolean;
  ip: string | null;
  requestId: string;
  username: string | null;
  tokenName: string | null;
  group: string | null;
  message: string;
}

export function kindToTypes(kind: string): number[] {
  switch (kind) {
    case 'consume': return [2];
    case 'error': return [5];
    case 'sys': return [3, 7];
    case 'success': return [2];
    case 'failure': return [5];
    default: return [2, 3, 5, 7];
  }
}

function logRowToDto(r: LogRow): LogDto {
  const type = Number(r.type);
  const success = type !== 5;
  let message = r.content ?? '';
  if (type === 2) {
    message = `消耗记录 userId=${r.username ?? '?'} model=${r.model_name ?? '?'} tokens=${r.prompt_tokens}+${r.completion_tokens} quota=${r.quota}`;
  }
  return {
    id: r.id,
    timestamp: Number(r.created_at) * 1000,
    type,
    typeLabel: type === 2 ? '计费' : type === 5 ? '错误' : type === 3 ? '系统' : '登录',
    kind: type === 2 ? 'consume' : type === 5 ? 'error' : 'sys',
    success,
    model: r.model_name,
    channelId: r.channel_id,
    channelName: r.channel_name,
    quota: Number(r.quota),
    promptTokens: Number(r.prompt_tokens),
    completionTokens: Number(r.completion_tokens),
    isStream: r.is_stream ?? false,
    ip: r.ip,
    requestId: r.request_id,
    username: r.username,
    tokenName: r.token_name,
    group: r.group,
    message,
  };
}
