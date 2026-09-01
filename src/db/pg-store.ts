import pg from 'pg';
import type { PoolConfig } from 'pg';

const { Pool } = pg;

export interface PgTimeRange {
  /** epoch seconds (NewAPI created_at 单位) */
  startSec: number;
  endSec: number;
}

export interface PgConsumeRow {
  id: string;
  createdAt: number;
  userId: string;
  type: string;
  modelName: string;
  channelId: string;
  channelName: string;
  quota: string;
  promptTokens: string;
  completionTokens: string;
  isStream: boolean;
  ip: string;
  requestId: string;
  username: string;
  tokenName: string;
  group: string;
  other: Record<string, unknown> | null;
}

export interface PgErrorRow {
  id: string;
  createdAt: number;
  userId: string;
  channelId: string;
  modelName: string;
  content: string;
  requestId: string;
}

export interface PgCountRow {
  key: string;
  requests: string;
  promptTokens: string;
  completionTokens: string;
  quota: string;
  errors: string;
  totalTime: string;
  cacheTokens: string;
  totalFrt: string;
  frtCount: string;
  firstSeen: string;
  lastSeen: string;
}

/** 轻量 PG 数据访问层（只读，NewAPI 生产库） */
export class PgStore {
  private pool: InstanceType<typeof Pool>;

  constructor(dsn: string) {
    this.pool = new Pool({
      connectionString: dsn,
      max: 4,
      idleTimeoutMillis: 60_000,
    } satisfies PoolConfig);
  }

  async init(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('SELECT 1');
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  query<T extends pg.QueryResultRow>(sql: string, params: unknown[] = []): Promise<pg.QueryResult<T>> {
    return this.pool.query<T>(sql, params);
  }

  // ─── 总览聚合 ───

  async getSummary(startSec: number, endSec: number): Promise<OverviewAgg> {
    const res = await this.query<{
      requests: string; consumes: string; errors: string; error_logs: string;
      prompt: string; completion: string; quota: string; cache: string;
      stream: string; client_gone: string;
      models: string; channels: string; users: string; tokens: string; groups: string;
      use_time: string; frt_sum: string; frt_count: string;
      first_entry: string | null; last_entry: string | null;
    }>(
      `SELECT
        COUNT(*) FILTER (WHERE type = 2)::bigint AS consumes,
        SUM(prompt_tokens)::bigint AS prompt,
        SUM(completion_tokens)::bigint AS completion,
        SUM(quota)::bigint AS quota,
        SUM(use_time)::bigint AS use_time,
        COUNT(*) FILTER (WHERE is_stream)::bigint AS stream,
        COUNT(DISTINCT model_name)::bigint AS models,
        COUNT(DISTINCT channel_id)::bigint AS channels,
        COUNT(DISTINCT user_id)::bigint AS users,
        COUNT(DISTINCT token_name)::bigint AS tokens,
        COUNT(DISTINCT "group")::bigint AS groups,
        MIN(created_at) AS first_entry,
        MAX(created_at) AS last_entry,
        0::bigint AS errors,
        0::bigint AS error_logs,
        0::bigint AS cache,
        0::bigint AS client_gone,
        0::bigint AS frt_sum,
        0::bigint AS frt_count,
        0::bigint AS requests
      FROM logs
      WHERE type = 2 AND created_at >= $1 AND created_at < $2`,
      [startSec, endSec],
    );
    const r = res.rows[0];
    const requests = Number(r.requests ?? 0);
    return {
      requests,
      consumes: Number(r.consumes ?? 0),
      promptTokens: Number(r.prompt ?? 0),
      completionTokens: Number(r.completion ?? 0),
      quota: Number(r.quota ?? 0),
      errors: Number(r.errors ?? 0),
      errorLogs: Number(r.error_logs ?? 0),
      cacheTokens: Number(r.cache ?? 0),
      streamCount: Number(r.stream ?? 0),
      clientGone: Number(r.client_gone ?? 0),
      models: Number(r.models ?? 0),
      channels: Number(r.channels ?? 0),
      users: Number(r.users ?? 0),
      tokens: Number(r.tokens ?? 0),
      groups: Number(r.groups ?? 0),
      useTime: Number(r.use_time ?? 0),
      frtSum: Number(r.frt_sum ?? 0),
      frtCount: Number(r.frt_count ?? 0),
      firstEntry: r.first_entry ? Number(r.first_entry) * 1000 : null,
      lastEntry: r.last_entry ? Number(r.last_entry) * 1000 : null,
    };
  }

  async getTimeline(startSec: number, endSec: number, stepSec: number): Promise<TimelineRow[]> {
    const res = await this.query<TimelineRow>(
      `SELECT
        (created_at / $3) * $3 AS bucket,
        COUNT(*)::bigint AS requests,
        SUM(prompt_tokens)::bigint AS prompt_tokens,
        SUM(completion_tokens)::bigint AS completion_tokens,
        SUM(quota)::bigint AS quota,
        COUNT(DISTINCT model_name)::bigint AS models,
        COUNT(DISTINCT user_id)::bigint AS users
      FROM logs
      WHERE type = 2 AND created_at >= $1 AND created_at < $2
      GROUP BY bucket ORDER BY bucket`,
      [startSec, endSec, stepSec],
    );
    return res.rows;
  }

  // ─── 维度聚合（group by 任意列） ───

  async getDimension(
    dimension: string,
    startSec: number,
    endSec: number,
    sort: string,
    limit: number,
    offset: number,
  ): Promise<{ total: number; data: PgCountRow[] }> {
    const sortCols: Record<string, string> = {
      requests: 'requests',
      tokens: 'total_tokens',
      quota: 'quota',
      cost: 'quota',
      errors: 'errors',
      frt: 'frt',
    };
    const orderCol = sortCols[sort] ?? 'requests';
    // 维度 → 数据库列名映射
    const COLUMNS: Record<string, string> = {
      model: 'model_name',
      channel: 'channel_id::text',
      token: 'token_name',
      user: 'user_id::text',
      group: '"group"',
    };
    const column = COLUMNS[dimension] ?? '"group"';

    const countRes = await this.query<{ count: string }>(
      `SELECT COUNT(DISTINCT ${column})::bigint AS count FROM logs WHERE type = 2 AND created_at >= $1 AND created_at < $2`,
      [startSec, endSec],
    );
    const dataRes = await this.query<PgCountRow>(
      `SELECT ${column} AS key,
        COUNT(*)::bigint AS requests,
        SUM(prompt_tokens)::bigint AS prompt_tokens,
        SUM(completion_tokens)::bigint AS completion_tokens,
        (SUM(prompt_tokens) + SUM(completion_tokens))::bigint AS total_tokens,
        SUM(quota)::bigint AS quota,
        0::bigint AS errors,
        SUM(use_time)::bigint AS total_time,
        MIN(created_at)::bigint AS first_seen,
        MAX(created_at)::bigint AS last_seen,
        0::bigint AS cache_tokens,
        0::bigint AS total_frt,
        0::bigint AS frt_count,
        0::bigint AS frt
      FROM logs
      WHERE type = 2 AND created_at >= $1 AND created_at < $2
      GROUP BY ${column}
      ORDER BY ${orderCol} DESC
      LIMIT $3 OFFSET $4`,
      [startSec, endSec, limit, offset],
    );
    return { total: Number(countRes.rows[0]?.count ?? 0), data: dataRes.rows };
  }

  // ─── 原始日志流 ───

  async getLogsStream(
    startSec: number,
    endSec: number,
    types: number[],
    limit: number,
    offset: number,
  ): Promise<{ total: number; data: LogRow[] }> {
    const res = await this.query<LogRow>(
      `SELECT id, created_at, type, model_name, channel_id, channel_name, quota,
              prompt_tokens, completion_tokens, is_stream, ip, request_id,
              username, token_name, "group", content
       FROM logs
       WHERE created_at >= $1 AND created_at < $2 AND type = ANY($3)
       ORDER BY id DESC LIMIT $4 OFFSET $5`,
      [startSec, endSec, types, limit, offset],
    );
    const countRes = await this.query<{ count: string }>(
      `SELECT COUNT(*)::bigint AS count FROM logs WHERE created_at >= $1 AND created_at < $2 AND type = ANY($3)`,
      [startSec, endSec, types],
    );
    return { total: Number(countRes.rows[0]?.count ?? 0), data: res.rows };
  }

  /** 轮询增量：自某 id 之后的新记录 */
  async getNewLogs(afterId: number, limit: number): Promise<LogRow[]> {
    const res = await this.query<LogRow>(
      `SELECT id, created_at, type, model_name, channel_id, channel_name, quota,
              prompt_tokens, completion_tokens, is_stream, ip, request_id,
              username, token_name, "group", content
       FROM logs WHERE id > $1 ORDER BY id ASC LIMIT $2`,
      [afterId, limit],
    );
    return res.rows;
  }

  async getMaxId(): Promise<number> {
    const res = await this.query<{ max: string | null }>(`SELECT MAX(id)::bigint AS max FROM logs`);
    return Number(res.rows[0]?.max ?? 0);
  }
}

export interface OverviewAgg {
  requests: number;
  consumes: number;
  promptTokens: number;
  completionTokens: number;
  quota: number;
  errors: number;
  errorLogs: number;
  cacheTokens: number;
  streamCount: number;
  clientGone: number;
  models: number;
  channels: number;
  users: number;
  tokens: number;
  groups: number;
  useTime: number;
  frtSum: number;
  frtCount: number;
  firstEntry: number | null;
  lastEntry: number | null;
}

export interface TimelineRow {
  bucket: string;
  requests: string;
  prompt_tokens: string;
  completion_tokens: string;
  quota: string;
  models: string;
  users: string;
}

export interface LogRow {
  id: string;
  created_at: number;
  type: number;
  model_name: string | null;
  channel_id: number | null;
  channel_name: string | null;
  quota: number;
  prompt_tokens: number;
  completion_tokens: number;
  is_stream: boolean | null;
  ip: string | null;
  request_id: string;
  username: string | null;
  token_name: string | null;
  group: string | null;
  content: string | null;
}
