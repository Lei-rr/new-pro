import { z } from 'zod';
import type { ApiApp } from '../app-type.js';
import type { IStore } from '../../store/interface.js';
import type { ConsumeLogEntry } from '../../types/log.js';
import { isConsume } from '../../types/log.js';
import { QUOTA_PER_COST_UNIT } from '../../constants.js';
import { getIpLocation } from '../../utils/geo.js';

const num = z.string().regex(/^\d+$/).transform(Number);
const epochMs = z.string().regex(/^\d+$/).transform(Number);

const paginationQuery = z.object({
  limit: num.optional(),
  offset: num.optional(),
});

const searchQuery = paginationQuery.extend({
  q: z.string().optional(),
  model: z.string().optional(),
  user: z.string().optional(),
  channel: z.string().optional(),
  ip: z.string().optional(),
  start: epochMs.optional(),
  end: epochMs.optional(),
});

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
  app.get('/logs/recent', { schema: { querystring: paginationQuery } }, async (request) => {
    const limit = Math.min(Math.max(1, request.query.limit ?? 50), 500);
    const offset = Math.max(0, request.query.offset ?? 0);
    const res = store.getRecentConsumeLogs(limit, offset);
    return {
      total: res.total,
      count: res.data.length,
      offset,
      limit,
      data: res.data.filter(isConsume).map(formatConsume),
    };
  });

  app.get('/logs/search', { schema: { querystring: searchQuery } }, async (request) => {
    const q = request.query;
    const limit = Math.min(Math.max(1, q.limit ?? 50), 500);
    const offset = Math.max(0, q.offset ?? 0);

    const res = store.searchLogs({
      q: q.q,
      model: q.model,
      user: q.user,
      channel: q.channel,
      ip: q.ip,
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
      data: res.data.filter(isConsume).map(formatConsume),
    };
  });
}
