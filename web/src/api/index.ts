import { request } from './http';
import type {
  AlertsResponse,
  AlertSeverity,
  CostAnalyticsResponse,
  CostSummary,
  CostTrendPoint,
  DashboardResponse,
  DimensionResponse,
  DimensionSort,
  DimensionType,
  HealthInfo,
  LogFacetsResponse,
  RawLogResponse,
  OverviewSummary,
  TimelineBucket,
} from './types';

/** 后端端点按域组织（/api/v1） */
export const api = {
  health: {
    get(): Promise<HealthInfo> {
      return request('/api/v1/health');
    },
  },

  overview: {
    summary(start?: number, end?: number): Promise<OverviewSummary> {
      return request('/api/v1/overview/summary', { start, end });
    },
    timeline(hours = 24): Promise<TimelineBucket[]> {
      return request('/api/v1/overview/timeline', { hours });
    },
    /** 总览页聚合：KPI（含上期）+ 时间线 + Top 榜，一次请求 */
    dashboard(hours = 24): Promise<DashboardResponse> {
      return request('/api/v1/dashboard', { hours });
    },
  },

  dimension: {
    get(
      type: DimensionType,
      opts: { sort?: DimensionSort; limit?: number; offset?: number; start?: number; end?: number } = {},
    ): Promise<DimensionResponse> {
      return request(`/api/v1/dimension/${type}`, {
        sort: opts.sort,
        limit: opts.limit,
        offset: opts.offset,
        start: opts.start,
        end: opts.end,
      });
    },
  },

  cost: {
    summary(): Promise<CostSummary> {
      return request('/api/v1/cost/summary');
    },
    trend(days = 14): Promise<CostTrendPoint[]> {
      return request('/api/v1/cost/trend', { days });
    },
    /** 成本页聚合：KPI + 趋势 + Token/模型消耗榜，一次请求 */
    analytics(days = 14): Promise<CostAnalyticsResponse> {
      return request('/api/v1/cost/analytics', { days });
    },
  },

  logs: {
    /** 原始日志流（全量、不去重；kind: all/consume/gin/error/success/failure） */
    stream(filter: {
      kind?: string;
      q?: string;
      start?: number;
      end?: number;
      limit?: number;
      offset?: number;
    } = {}): Promise<RawLogResponse> {
      return request('/api/v1/logs/stream', {
        kind: filter.kind,
        q: filter.q,
        start: filter.start,
        end: filter.end,
        limit: filter.limit,
        offset: filter.offset,
      });
    },
    /** 筛选器候选值（模型/渠道/用户去重列表） */
    facets(): Promise<LogFacetsResponse> {
      return request('/api/v1/logs/facets');
    },
  },

  alerts: {
    get(severity?: AlertSeverity): Promise<AlertsResponse> {
      return request('/api/v1/alerts', { severity });
    },
  },
};
