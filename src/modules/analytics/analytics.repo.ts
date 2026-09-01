import type { Database } from '../../core/db.js';
import { LogType } from '../../shared/constants.js';
import { DIMENSION_COLUMNS, DIMENSION_SORT_COLUMNS } from '../../shared/constants.js';
import type {
  DimensionRow,
  DistinctRow,
  SummaryRow,
  TimelineRow,
} from './analytics.types.js';

/**
 * 统计仓库：聚合 SQL（总览/时间线/维度）。
 * 返回 snake_case 行，不在此层做任何映射。
 */
export class AnalyticsRepository {
  constructor(private db: Database) {}

  async summary(startSec: number, endSec: number): Promise<SummaryRow> {
    const res = await this.db.query<SummaryRow>(
      `SELECT
        (SELECT COUNT(*)::bigint FROM logs WHERE type = $3 AND created_at >= $1 AND created_at < $2) AS consumes,
        (SELECT COALESCE(SUM(prompt_tokens), 0)::bigint FROM logs WHERE type = $3 AND created_at >= $1 AND created_at < $2) AS prompt,
        (SELECT COALESCE(SUM(completion_tokens), 0)::bigint FROM logs WHERE type = $3 AND created_at >= $1 AND created_at < $2) AS completion,
        (SELECT COALESCE(SUM(quota), 0)::bigint FROM logs WHERE type = $3 AND created_at >= $1 AND created_at < $2) AS quota,
        (SELECT COALESCE(SUM(use_time), 0)::bigint FROM logs WHERE type = $3 AND created_at >= $1 AND created_at < $2) AS use_time,
        (SELECT COUNT(*)::bigint FROM logs WHERE type = $3 AND is_stream AND created_at >= $1 AND created_at < $2) AS stream,
        (SELECT COUNT(*)::bigint FROM logs WHERE type = $4 AND created_at >= $1 AND created_at < $2) AS errors`,
      [startSec, endSec, LogType.Consume, LogType.Error],
    );
    return res.rows[0] ?? {
      consumes: '0', prompt: '0', completion: '0', quota: '0',
      use_time: '0', stream: '0', errors: '0',
    };
  }

  async distinctCounts(startSec: number, endSec: number): Promise<DistinctRow> {
    const res = await this.db.query<DistinctRow>(
      `SELECT
        COUNT(DISTINCT model_name)::bigint AS models,
        COUNT(DISTINCT channel_id)::bigint AS channels,
        COUNT(DISTINCT user_id)::bigint AS users,
        COUNT(DISTINCT token_name)::bigint AS tokens,
        COUNT(DISTINCT "group")::bigint AS groups,
        MIN(created_at) AS first_entry,
        MAX(created_at) AS last_entry
      FROM logs
      WHERE type = $3 AND created_at >= $1 AND created_at < $2`,
      [startSec, endSec, LogType.Consume],
    );
    return res.rows[0] ?? {
      models: '0', channels: '0', users: '0', tokens: '0', groups: '0',
      first_entry: null, last_entry: null,
    };
  }

  async timeline(startSec: number, endSec: number, stepSec: number): Promise<TimelineRow[]> {
    const res = await this.db.query<TimelineRow>(
      `SELECT
        (created_at / $3) * $3 AS bucket,
        COUNT(*)::bigint AS requests,
        SUM(prompt_tokens)::bigint AS prompt_tokens,
        SUM(completion_tokens)::bigint AS completion_tokens,
        SUM(quota)::bigint AS quota
      FROM logs
      WHERE type = $4 AND created_at >= $1 AND created_at < $2
      GROUP BY bucket ORDER BY bucket`,
      [startSec, endSec, stepSec, LogType.Consume],
    );
    return res.rows;
  }

  async dimension(
    dimension: string,
    startSec: number,
    endSec: number,
    sort: string,
    limit: number,
    offset: number,
  ): Promise<{ total: number; rows: DimensionRow[] }> {
    const column = DIMENSION_COLUMNS[dimension] ?? DIMENSION_COLUMNS.group;
    const orderCol = DIMENSION_SORT_COLUMNS[sort] ?? 'requests';

    const countRes = await this.db.query<{ count: string }>(
      `SELECT COUNT(DISTINCT ${column})::bigint AS count FROM logs
       WHERE type = $3 AND created_at >= $1 AND created_at < $2`,
      [startSec, endSec, LogType.Consume],
    );
    const res = await this.db.query<DimensionRow>(
      `SELECT ${column} AS key,
        COUNT(*)::bigint AS requests,
        SUM(prompt_tokens)::bigint AS prompt_tokens,
        SUM(completion_tokens)::bigint AS completion_tokens,
        (SUM(prompt_tokens) + SUM(completion_tokens))::bigint AS total_tokens,
        SUM(quota)::bigint AS quota,
        SUM(use_time)::bigint AS total_time,
        MIN(created_at)::bigint AS first_seen,
        MAX(created_at)::bigint AS last_seen
      FROM logs
      WHERE type = $3 AND created_at >= $1 AND created_at < $2
      GROUP BY ${column}
      ORDER BY ${orderCol} DESC
      LIMIT $4::int OFFSET $5::int`,
      [startSec, endSec, LogType.Consume, limit, offset],
    );
    return { total: Number(countRes.rows[0]?.count ?? 0), rows: res.rows };
  }

  async errorCountByDimension(
    dimension: string,
    startSec: number,
    endSec: number,
    limit: number,
  ): Promise<Array<{ key: string; errors: string }>> {
    const column = DIMENSION_COLUMNS[dimension] ?? DIMENSION_COLUMNS.group;
    const res = await this.db.query<{ key: string; errors: string }>(
      `SELECT ${column} AS key, COUNT(*)::bigint AS errors
       FROM logs
       WHERE type = $3 AND created_at >= $1 AND created_at < $2
       GROUP BY ${column}
       ORDER BY errors DESC
       LIMIT $4::int`,
      [startSec, endSec, LogType.Error, limit],
    );
    return res.rows;
  }
}
