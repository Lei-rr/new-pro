import { z } from 'zod';
import type { ApiApp } from '../app-type.js';
import type { IStore } from '../../store/interface.js';
import type { ConsumeLogEntry, ParsedLogEntry } from '../../types/log.js';
import { isConsume, isError, isGin } from '../../types/log.js';
import { QUOTA_PER_COST_UNIT } from '../../constants.js';
import { getIpLocation } from '../../utils/geo.js';

const num = z.string().regex(/^\d+$/).transform(Number);
const epochMs = z.string().regex(/^\d+$/).transform(Number);


const streamQuery = z.object({
  kind: z.enum(['all', 'consume', 'gin', 'error', 'sys', 'success', 'failure']).optional(),
  q: z.string().optional(),
  start: epochMs.optional(),
  end: epochMs.optional(),
  limit: num.optional(),
  offset: num.optional(),
});

/** 原始日志行（保持原样输出，仅按状态/等级分类） */
function formatRawLog(e: ParsedLogEntry) {
  const base = {
    timestamp: e.timestamp.getTime(),
    requestId: 'requestId' in e ? e.requestId : null,
    sourceFile: e.sourceFile,
  };

  if (isConsume(e)) {
    const f = formatConsume(e);
    return {
      ...base,
      level: 'INFO' as const,
      kind: 'consume' as const,
      success: true,
      message: `消耗记录 userId=${e.userId} model=${e.params.model_name} tokens=${e.params.prompt_tokens}+${e.params.completion_tokens} quota=${e.params.quota}`,
      detail: { ...f, modelRatio: f.modelRatio ?? e.params.other?.model_ratio ?? null },
    };
  }
  if (isGin(e)) {
    return {
      ...base,
      level: 'GIN' as const,
      kind: 'gin' as const,
      success: e.statusCode < 400,
      statusCode: e.statusCode,
      message: `${e.method} ${e.path} -> ${e.statusCode} (${e.duration})`,
      detail: { ip: e.ip, routeType: e.routeType },
    };
  }
  if (isError(e)) {
    return {
      ...base,
      level: 'ERR' as const,
      kind: 'error' as const,
      success: false,
      message: e.message,
      detail: null,
    };
  }
  return {
    ...base,
    level: e.level,
    kind: e.level === 'SYS' ? 'sys' : 'info',
    success: true,
    message: e.message,
    detail: null,
  };
}

/** Flatten a consume entry for API response */
function formatConsume(e: ConsumeLogEntry) {
  const p = e.params;
  const other = p.other ?? {};
  return {
    timestamp: e.timestamp.getTime(),
    requestId: e.requestId,
    userId: e.userId,
    ip: e.ip ?? null,
    ipLocation: getIpLocation(e.ip),
    channelId: p.channel_id,
    model: p.model_name,
    tokenName: p.token_name,
    tokenId: p.token_id,
    promptTokens: p.prompt_tokens,
    completionTokens: p.completion_tokens,
    cacheTokens: other.cache_tokens ?? 0,
    quota: p.quota,
    cost: p.quota / QUOTA_PER_COST_UNIT,
    useTime: p.use_time_seconds,
    frt: other.frt ?? null,
    isStream: p.is_stream,
    group: p.group || 'default',
    requestPath: other.request_path ?? null,
    billingSource: other.billing_source ?? null,
    billingMode: other.billing_mode ?? null,
    streamStatus: other.stream_status?.status ?? null,
    modelRatio: other.model_ratio ?? null,
    modelPrice: other.model_price ?? null,
    completionRatio: other.completion_ratio ?? null,
    groupRatio: other.group_ratio ?? null,
    userGroupRatio: other.user_group_ratio ?? null,
    cacheRatio: other.cache_ratio ?? null,
    matchedTier: other.matched_tier ?? null,
    adminUseChannel: other.admin_info?.use_channel ?? null,
  };
}

export function registerLogRoutes(app: ApiApp, store: IStore): void {
  // 原始日志流（全量，不去重；按等级/成功失败筛选）
  app.get('/logs/stream', { schema: { querystring: streamQuery } }, async (request) => {
    const q = request.query;
    const limit = Math.min(Math.max(1, q.limit ?? 50), 500);
    const offset = Math.max(0, q.offset ?? 0);

    const res = store.getRawLogs({
      kind: q.kind ?? 'all',
      q: q.q,
      start: q.start,
      end: q.end,
      limit,
      offset,
    });
    return {
      total: res.total,
      count: res.data.length,
      offset,
      limit,
      data: res.data.map(formatRawLog),
    };
  });

  // 筛选器候选值：模型/渠道/用户的 Top-N 去重列表（供前端下拉框）
  app.get('/logs/facets', async () => {
    const facet = (dimension: 'model' | 'channel' | 'user') =>
      store
        .getDimensionStats(dimension, { sort: 'requests', limit: 50 })
        .data.map((d) => ({ key: d.key, requests: d.requests }));
    return {
      models: facet('model'),
      channels: facet('channel'),
      users: facet('user'),
    };
  });
}
