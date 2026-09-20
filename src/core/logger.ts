import type { FastifyBaseLogger } from 'fastify'

type Bindings = Record<string, unknown>
type LevelName = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace'

interface LogRecord {
  level: number
  time: number
  msg?: string
  err?: { message: string; stack?: string }
  [key: string]: unknown
}

const LEVEL_NUMBERS: Record<LevelName, number> = {
  fatal: 60,
  error: 50,
  warn: 40,
  info: 30,
  debug: 20,
  trace: 10,
}

function normalizeError(value: unknown): { message: string; stack?: string } | undefined {
  if (value instanceof Error) return { message: value.message, stack: value.stack }
  if (typeof value === 'string') return { message: value }
  return undefined
}

function serialize(level: LevelName, bindings: Bindings, args: unknown[]): LogRecord {
  const record: LogRecord = { level: LEVEL_NUMBERS[level], time: Date.now(), ...bindings }
  let message: string | undefined

  for (const arg of args) {
    if (arg instanceof Error) {
      record.err = { message: arg.message, stack: arg.stack }
      message ??= arg.message
      continue
    }
    if (arg && typeof arg === 'object') {
      for (const [key, value] of Object.entries(arg as Record<string, unknown>)) {
        if (key === 'level' || key === 'time') continue
        if (key === 'err') record.err = normalizeError(value)
        else record[key] = value
      }
      continue
    }
    if (arg !== undefined && arg !== null) message ??= String(arg)
  }

  if (message !== undefined) record.msg = message
  return record
}

const REDACTED_KEYS = new Set(['password', 'token', 'authorization', 'cookie', 'auth_token', 'jwt'])

function sanitize(value: unknown, seen: WeakSet<object>): unknown {
  if (value === null || value === undefined) return value
  if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'bigint') return value.toString()
  if (typeof value === 'function') return '[Function]'
  if (value instanceof Error) return { message: value.message, stack: value.stack }
  if (value instanceof Date) return value.toISOString()
  if (typeof value !== 'object') return String(value)

  if (seen.has(value)) return '[Circular]'
  seen.add(value)

  if (Array.isArray(value)) {
    const list = value.slice(0, 50).map((item) => sanitize(item, seen))
    if (value.length > 50) list.push(`[+${value.length - 50} more]`)
    return list
  }

  const output: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (REDACTED_KEYS.has(key.toLowerCase())) {
      output[key] = '[Redacted]'
      continue
    }
    output[key] = sanitize(item, seen)
  }
  return output
}

function write(level: LevelName, bindings: Bindings, args: unknown[]): void {
  if (LOG_LEVEL_ORDER[level] > LOG_LEVEL_ORDER[configuredLevel]) return

  const record = serialize(level, bindings, args)
  const line = JSON.stringify(sanitize(record, new WeakSet())) + '\n'
  if (LEVEL_NUMBERS[level] >= LEVEL_NUMBERS.error) process.stderr.write(line)
  else process.stdout.write(line)
}

const LOG_LEVEL_ORDER: Record<LevelName, number> = { fatal: 0, error: 1, warn: 2, info: 3, debug: 4, trace: 5 }

let configuredLevel: LevelName = 'info'

/** 由进程入口在启动时注入，避免各日志器重复读取环境变量 */
export function setLogLevel(level: LevelName): void {
  configuredLevel = level
}

function createBoundLogger(bindings: Bindings): FastifyBaseLogger {
  const logger: Record<string, unknown> = {
    level: 'info',
    fatal: (...args: unknown[]) => write('fatal', bindings, args),
    error: (...args: unknown[]) => write('error', bindings, args),
    warn: (...args: unknown[]) => write('warn', bindings, args),
    info: (...args: unknown[]) => write('info', bindings, args),
    debug: (...args: unknown[]) => write('debug', bindings, args),
    trace: (...args: unknown[]) => write('trace', bindings, args),
    silent: () => undefined,
  }
  logger.child = (childBindings: Bindings) => createBoundLogger({ ...bindings, ...childBindings })
  return logger as unknown as FastifyBaseLogger
}

/** 进程级日志器：单行 JSON 输出，可直接作为 Fastify loggerInstance */
export const rootLogger: FastifyBaseLogger = createBoundLogger({})

/** 业务模块日志器，固定携带模块名便于检索 */
export function createLogger(module: string): FastifyBaseLogger {
  return createBoundLogger({ module })
}
