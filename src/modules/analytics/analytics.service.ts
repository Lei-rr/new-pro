import { loadConfig } from '../../config/env.js';
import { startOfDayMs } from '../../shared/time.js';
import { QUOTA_PER_COST_UNIT, timelineStep } from '../../shared/constants.js';
import type { AnalyticsRepository } from './analytics.repo.js';
import type {
  ChannelHealthDto,
  CostAnalyticsResponse,
  DashboardResponse,
  DimensionDto,
  DimensionKey,
  SummaryDto,
  TimelineDto,
} from './analytics.types.js';

/** 统计服务：窗口计算 + 行→DTO 映射 + 聚合编排（无 SQL） */
export class AnalyticsService {
  constructor(private repo: AnalyticsRepository) {}

  private dayRange(days: number): { startSec: number; endSec: number } {
    const config = loadConfig();
    const now = Date.now();
    const startMs = startOfDayMs(now, config.LOG_TZ, days - 1);
    return { startSec: Math.floor(startMs / 1000), endSec: Math.floor(now / 1000) };
  }

  async summary(start?: number, end?: number): Promise<SummaryDto> {
    const config = loadConfig();
    const range = start !== undefined && end !== undefined
      ? { startSec: Math.floor(start / 1000), endSec: Math.floor(end / 1000) }
      : this.dayRange(config.DEFAULT_RANGE_DAYS);

    const [agg, distinct] = await Promise.all([
      this.repo.summary(range.startSec, range.endSec),
      this.repo.distinctCounts(range.startSec, range.endSec),
    ]);

    const consumes = Number(agg.consumes);
    const errors = Number(agg.errors);
    return {
      billingRequests: consumes,
      totalPromptTokens: Number(agg.prompt),
      totalCompletionTokens: Number(agg.completion),
      totalQuota: Number(agg.quota),
      totalCost: Number(agg.quota) / QUOTA_PER_COST_UNIT,
      errorCount: errors,
      errorRate: consumes > 0 ? errors / consumes : 0,
      streamRatio: consumes > 0 ? Number(agg.stream) / consumes : 0,
      activeModels: Number(distinct.models),
      activeChannels: Number(distinct.channels),
      activeUsers: Number(distinct.users),
      activeTokens: Number(distinct.tokens),
      activeGroups: Number(distinct.groups),
      avgUseTime: consumes > 0 ? Number(agg.use_time) / consumes : 0,
      firstEntry: distinct.first_entry ? Number(distinct.first_entry) * 1000 : null,
      lastEntry: distinct.last_entry ? Number(distinct.last_entry) * 1000 : null,
    };
  }

  async timeline(days: number): Promise<TimelineDto[]> {
    const range = this.dayRange(days);
    const rows = await this.repo.timeline(range.startSec, range.endSec, timelineStep(days));
    return rows.map((r) => ({
      time: new Date(Number(r.bucket) * 1000).toISOString(),
      requests: Number(r.requests),
      promptTokens: Number(r.prompt_tokens),
      completionTokens: Number(r.completion_tokens),
      quota: Number(r.quota),
    }));
  }

  async dimension(
    dimension: DimensionKey,
    days: number,
    sort: string,
    limit: number,
    offset: number,
  ): Promise<{ total: number; data: DimensionDto[] }> {
    const range = this.dayRange(days);
    const res = await this.repo.dimension(dimension, range.startSec, range.endSec, sort, limit, offset);
    return {
      total: res.total,
      data: res.rows.map((r) => ({
        key: r.key,
        requests: Number(r.requests),
        promptTokens: Number(r.prompt_tokens),
        completionTokens: Number(r.completion_tokens),
        totalTokens: Number(r.total_tokens),
        quota: Number(r.quota),
        cost: Number(r.quota) / QUOTA_PER_COST_UNIT,
        avgUseTime: Number(r.requests) > 0 ? Number(r.total_time) / Number(r.requests) : 0,
        firstSeen: Number(r.first_seen) * 1000,
        lastSeen: Number(r.last_seen) * 1000,
      })),
    };
  }

  /** 渠道健康：请求 + 错误 → 错误率 */
  async channelHealth(days: number, limit = 8): Promise<ChannelHealthDto[]> {
    const range = this.dayRange(days);
    const [requests, errors] = await Promise.all([
      this.repo.dimension('channel', range.startSec, range.endSec, 'requests', limit, 0),
      this.repo.errorCountByDimension('channel', range.startSec, range.endSec, limit),
    ]);
    const errMap = new Map(errors.map((e) => [e.key, Number(e.errors)]));
    return requests.rows.map((r) => {
      const err = errMap.get(r.key) ?? 0;
      const req = Number(r.requests);
      return {
        key: r.key,
        requests: req,
        errors: err,
        errorRate: req > 0 ? err / req : 0,
      };
    });
  }

  /** 总览聚合（单请求） */
  async dashboard(days: number, alerts: unknown[]): Promise<DashboardResponse> {
    const config = loadConfig();
    const now = Date.now();
    const start = startOfDayMs(now, config.LOG_TZ, days - 1);
    const prevStart = startOfDayMs(now, config.LOG_TZ, days * 2 - 1);

    const [summary, prevSummary, timelineData, topModels, topChannels, topUsers, health] =
      await Promise.all([
        this.summary(start, now),
        this.summary(prevStart, start),
        this.timeline(days),
        this.dimension('model', days, 'requests', 8, 0),
        this.dimension('channel', days, 'requests', 8, 0),
        this.dimension('user', days, 'requests', 8, 0),
        this.channelHealth(days),
      ]);

    return {
      days,
      start,
      end: now,
      summary,
      prevSummary,
      timeline: timelineData,
      topModels: topModels.data,
      topChannels: topChannels.data,
      topUsers: topUsers.data,
      channelHealth: health,
      alerts: alerts.slice(0, 5),
    };
  }

  /** 成本聚合（单请求） */
  async costAnalytics(days: number): Promise<CostAnalyticsResponse> {
    const [summaryData, timelineData, tokenTop, modelTop] = await Promise.all([
      this.summary(),
      this.timeline(days),
      this.dimension('token', days, 'quota', 10, 0),
      this.dimension('model', days, 'quota', 8, 0),
    ]);
    return {
      totalQuota: summaryData.totalQuota,
      totalCost: summaryData.totalCost,
      billingRequests: summaryData.billingRequests,
      avgCostPerRequest: summaryData.billingRequests > 0
        ? summaryData.totalCost / summaryData.billingRequests
        : 0,
      todayCost: summaryData.totalCost,
      todayRequests: summaryData.billingRequests,
      trend: timelineData.map((t) => ({
        date: t.time.slice(0, 10),
        quota: t.quota,
        cost: t.quota / QUOTA_PER_COST_UNIT,
        requests: t.requests,
      })),
      tokenTop: tokenTop.data,
      modelTop: modelTop.data,
    };
  }
}
