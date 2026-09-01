import type { Database } from '../../core/db.js';
import type { LogRow } from './logs.types.js';

const LOG_COLUMNS = `id, created_at, type, model_name, channel_id, channel_name, quota,
  prompt_tokens, completion_tokens, is_stream, ip, request_id,
  username, token_name, "group", content`;

/**
 * 日志仓库：logs 表的列表/增量查询。
 * 返回 snake_case 行，不在此层做任何映射。
 */
export class LogsRepository {
  constructor(private db: Database) {}

  async stream(
    startSec: number,
    endSec: number,
    types: readonly number[],
    q: string | undefined,
    limit: number,
    offset: number,
  ): Promise<{ total: number; rows: LogRow[] }> {
    const search = q && q.trim().length > 0 ? `%${q.trim()}%` : null;
    const searchCond = search
      ? 'AND (model_name ILIKE $4 OR token_name ILIKE $4 OR username ILIKE $4 OR request_id ILIKE $4)'
      : '';

    const baseParams: unknown[] = [startSec, endSec, [...types]];
    if (search) baseParams.push(search);

    // 分页参数占位符随 search 是否存在而变
    const limitIdx = search ? 5 : 4;
    const offsetIdx = search ? 6 : 5;

    const [countRes, rowsRes] = await Promise.all([
      this.db.query<{ count: string }>(
        `SELECT COUNT(*)::bigint AS count FROM logs
         WHERE created_at >= $1 AND created_at < $2 AND type = ANY($3) ${searchCond}`,
        baseParams,
      ),
      this.db.query<LogRow>(
        `SELECT ${LOG_COLUMNS} FROM logs
         WHERE created_at >= $1 AND created_at < $2 AND type = ANY($3) ${searchCond}
         ORDER BY id DESC LIMIT $${limitIdx}::int OFFSET $${offsetIdx}::int`,
        [...baseParams, limit, offset],
      ),
    ]);
    return { total: Number(countRes.rows[0]?.count ?? 0), rows: rowsRes.rows };
  }

  /** 主键游标增量（实时推送） */
  async sinceId(afterId: number, limit: number): Promise<LogRow[]> {
    const res = await this.db.query<LogRow>(
      `SELECT ${LOG_COLUMNS} FROM logs WHERE id > $1 ORDER BY id ASC LIMIT $2::int`,
      [afterId, limit],
    );
    return res.rows;
  }

  async maxId(): Promise<number> {
    const res = await this.db.query<{ max: string | null }>(`SELECT MAX(id)::bigint AS max FROM logs`);
    return Number(res.rows[0]?.max ?? 0);
  }
}
