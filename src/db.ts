import pg from 'pg'

const { Pool } = pg

let pool: pg.Pool | null = null

export function initDb(dsn: string): pg.Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: dsn,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
      options: '-c timezone=Asia/Shanghai',
    })

    pool.on('error', (err) => {
      console.error('[DB Pool Error]', err)
    })
  }
  return pool
}

export function getDb(): pg.Pool {
  if (!pool) {
    throw new Error('Database pool has not been initialized')
  }
  return pool
}

export async function query<R extends pg.QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<pg.QueryResult<R>> {
  return getDb().query<R>(text, params)
}

export async function checkDbConnection(): Promise<boolean> {
  try {
    const res = await query('SELECT 1 as alive')
    return res.rows.length > 0
  } catch (err) {
    console.error('Database connection test failed:', err)
    return false
  }
}

export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end()
    pool = null
  }
}
