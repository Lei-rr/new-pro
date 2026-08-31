import { request } from './http';
import type {
  AlertsResponse,
  CostSummary,
  CostTrendPoint,
  DimensionResponse,
  DimensionSort,
  DimensionType,
  HealthInfo,
  LogListResponse,
  LogSearchFilter,
  OverviewSummary,
  TimelineBucket,
} from './types';

export const api = {
  getHealth(): Promise<HealthInfo> {
    return request('/api/health');
  },

  getSummary(opts: { start?: number; end?: number } = {}): Promise<OverviewSummary> {
    return request('/api/overview/summary', {
      start: opts.start,
      end: opts.end,
    });
  },

  getTimeline(hours = 24): Promise<TimelineBucket[]> {
    return request('/api/overview/timeline', { hours });
  },

  getDimension(
    type: DimensionType,
    opts: { sort?: DimensionSort; limit?: number; offset?: number; start?: number; end?: number } = {},
  ): Promise<DimensionResponse> {
    return request(`/api/dimension/${type}`, {
      sort: opts.sort,
      limit: opts.limit,
      offset: opts.offset,
      start: opts.start,
      end: opts.end,
    });
  },

  getCostSummary(): Promise<CostSummary> {
    return request('/api/cost/summary');
  },

  getCostTrend(days = 14): Promise<CostTrendPoint[]> {
    return request('/api/cost/trend', { days });
  },

  getRecentLogs(limit = 50, offset = 0): Promise<LogListResponse> {
    return request('/api/logs/recent', { limit, offset });
  },

  searchLogs(filter: LogSearchFilter): Promise<LogListResponse> {
    return request('/api/logs/search', {
      q: filter.q,
      model: filter.model,
      user: filter.user,
      channel: filter.channel,
      ip: filter.ip,
      start: filter.start,
      end: filter.end,
      limit: filter.limit,
      offset: filter.offset,
    });
  },

  getAlerts(): Promise<AlertsResponse> {
    return request('/api/alerts');
  },
};
