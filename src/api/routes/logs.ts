import type { FastifyInstance } from 'fastify';
import type { IStore } from '../../store/interface.js';
import type { ConsumeLogEntry } from '../../types/log.js';
import { isConsume } from '../../types/log.js';
import { QUOTA_PER_COST_UNIT } from '../../utils/format.js';
import { getIpLocation } from '../../utils/geo.js';

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

export function registerLogRoutes(app: FastifyInstance, store: IStore): void {
  app.get<{
    Querystring: { limit?: string; offset?: string };
  }>('/api/logs/recent', async (request) => {
    const limit = Math.min(Math.max(1, parseInt(request.query.limit ?? '50', 10) || 50), 500);
    const offset = Math.max(0, parseInt(request.query.offset ?? '0', 10) || 0);
    const res = store.getRecentConsumeLogs(limit, offset);
    return {
      total: res.total,
      count: res.data.length,
      offset,
      limit,
      data: res.data.filter(isConsume).map(formatConsume),
    };
  });

  app.get<{
    Querystring: {
      q?: string;
      model?: string;
      user?: string;
      channel?: string;
      ip?: string;
      start?: string;
      end?: string;
      limit?: string;
      offset?: string;
    };
  }>('/api/logs/search', async (request) => {
    const limit = Math.min(Math.max(1, parseInt(request.query.limit ?? '50', 10) || 50), 500);
    const offset = Math.max(0, parseInt(request.query.offset ?? '0', 10) || 0);
    const start = request.query.start ? Number(request.query.start) || undefined : undefined;
    const end = request.query.end ? Number(request.query.end) || undefined : undefined;

    const res = store.searchLogs({
      q: request.query.q,
      model: request.query.model,
      user: request.query.user,
      channel: request.query.channel,
      ip: request.query.ip,
      start,
      end,
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
