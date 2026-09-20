import pg from 'pg'
import { getConfig } from '../config.js'
import { createLogger } from './logger.js'
import { increment, observe } from './metrics.js'

const { Pool } = pg
const log = createLogger('db')

let pool: pg.Pool | null = null

export function initDb(dsn: string, max = getConfig().dbPoolMax): pg.Pool {
  if (!pool) {
    const config = getConfig()
    pool = new Pool({
      connectionString: dsn,
      max,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
      allowExitOnIdle: false,
      options: `-c timezone=Asia/Shanghai -c statement_timeout=${config.dbStatementTimeoutMs}`,
    })

    pool.on('error', (err) => {
      increment('newpro_db_errors_total')
      log.error({ err }, 'idle client error')
    })
  }
  return pool
}

export function getDb(): pg.Pool {
  if (!pool) throw new Error('database pool has not been initialized')
  return pool
}

export function isDbReady(): boolean {
  return pool !== null
}

export function getDbPoolStats(): { total: number; idle: number; waiting: number } {
  if (!pool) return { total: 0, idle: 0, waiting: 0 }
  return { total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount }
}

/** 统一查询入口：记录耗时直方图并对慢查询告警 */
export async function query<R extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: readonly unknown[] = []
): Promise<pg.QueryResult<R>> {
  const started = performance.now()
  try {
    const result = await getDb().query<R>(text, params as unknown[])
    increment('newpro_db_queries_total', 1, { status: 'ok' })
    return result
  } catch (err) {
    increment('newpro_db_queries_total', 1, { status: 'error' })
    throw err
  } finally {
    const elapsed = performance.now() - started
    observe('newpro_db_query_duration_ms', elapsed)
    if (elapsed >= getConfig().slowQueryWarnMs) {
      log.warn({ durationMs: Math.round(elapsed), sql: text.replace(/\s+/g, ' ').slice(0, 160) }, 'slow query')
    }
  }
}

export async function checkDbConnection(): Promise<boolean> {
  if (!pool) return false
  try {
    const res = await pool.query('SELECT 1 AS alive')
    return res.rows.length > 0
  } catch (err) {
    log.error({ err }, 'connection check failed')
    return false
  }
}

export async function closeDb(): Promise<void> {
  if (pool) {
    const current = pool
    pool = null
    await current.end()
  }
}
