import pg from 'pg';
import { loadConfig } from '../config/env.js';

const config = loadConfig();

const POOL_OPTS = {
  max: 4,
  idleTimeoutMillis: 60_000,
  connectionTimeoutMillis: 5_000,
  application_name: 'new-pro-analytics',
} as const;

/**
 * 数据库连接池（core 层唯一 DB 入口）。
 * 仓库层通过此接口执行参数化查询。
 */
export class Database {
  private pool: pg.Pool;

  constructor(dsn: string) {
    this.pool = new pg.Pool({ connectionString: dsn, ...POOL_OPTS });
  }

  async connect(): Promise<void> {
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

  query<T extends pg.QueryResultRow = pg.QueryResultRow>(
    sql: string,
    params: readonly unknown[] = [],
  ): Promise<pg.QueryResult<T>> {
    return this.pool.query<T>(sql, params as unknown[]);
  }

  static fromEnv(): Database {
    const dsn = config.SQL_DSN;
    if (!dsn) {
      throw new Error('SQL_DSN is required (NewAPI PostgreSQL)');
    }
    return new Database(dsn);
  }
}
