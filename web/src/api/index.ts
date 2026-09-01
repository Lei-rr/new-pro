import { request } from './http';
import type {
  AlertsResponse,
  AlertSeverity,
  CostAnalyticsResponse,
  DashboardResponse,
  DimensionResponse,
  DimensionSort,
  DimensionType,
  HealthInfo,
  RawLogResponse,
} from './types';

/** 后端端点按域组织（/api/v1） */
export const api = {
  health: {
    get(): Promise<HealthInfo> {
      return request('/api/v1/health');
    },
  },

  overview: {
    /** 总览页聚合：KPI（含上期）+ 时间线 + Top 榜，一次请求 */
    dashboard(days = 7): Promise<DashboardResponse> {
      return request('/api/v1/dashboard', { days });
    },
  },

  dimension: {
    get(
      type: DimensionType,
      opts: { sort?: DimensionSort; limit?: number; offset?: number; days?: number } = {},
    ): Promise<DimensionResponse> {
      return request(`/api/v1/dimension/${type}`, {
        sort: opts.sort,
        limit: opts.limit,
        offset: opts.offset,
        days: opts.days,
      });
    },
  },

  cost: {
    /** 成本页聚合：KPI + 趋势 + Token/模型消耗榜，一次请求 */
    analytics(days = 7): Promise<CostAnalyticsResponse> {
      return request('/api/v1/cost/analytics', { days });
    },
  },

  logs: {
    /** 原始日志流（PG logs 表；kind: all/consume/error/sys） */
    stream(filter: {
      kind?: string;
      q?: string;
      days?: number;
      limit?: number;
      offset?: number;
    } = {}): Promise<RawLogResponse> {
      return request('/api/v1/logs/stream', {
        kind: filter.kind,
        q: filter.q,
        days: filter.days,
        limit: filter.limit,
        offset: filter.offset,
      });
    },
  },

  alerts: {
    get(severity?: AlertSeverity): Promise<AlertsResponse> {
      return request('/api/v1/alerts', { severity });
    },
  },
};
