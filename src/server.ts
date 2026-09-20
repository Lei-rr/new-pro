import { auditConfig, getConfig } from './config.js'
import { buildApp } from './core/app.js'
import { closeDb, initDb, isDbReady } from './core/db.js'
import { rootLogger, setLogLevel } from './core/logger.js'

const config = getConfig()
setLogLevel(config.logLevel === 'silent' ? 'fatal' : config.logLevel)

if (!config.pgDsn) {
  rootLogger.fatal('DATABASE_URL 未配置，服务无法启动')
  process.exit(1)
}

for (const warning of auditConfig(config)) {
  rootLogger.warn({ env: config.env }, warning)
}

initDb(config.pgDsn)

const app = await buildApp()
let shuttingDown = false

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return
  shuttingDown = true
  const started = Date.now()
  rootLogger.info({ signal }, 'shutting down')

  // 兜底超时：避免在途查询卡住导致容器被 SIGKILL 强杀
  const forceExit = setTimeout(() => {
    rootLogger.error({ timeoutMs: config.shutdownTimeoutMs }, 'graceful shutdown timed out, forcing exit')
    process.exit(1)
  }, config.shutdownTimeoutMs)
  forceExit.unref?.()

  try {
    await app.close()
    await closeDb()
    rootLogger.info({ durationMs: Date.now() - started }, 'shutdown complete')
  } finally {
    clearTimeout(forceExit)
  }
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void shutdown(signal).then(() => process.exit(0))
  })
}

process.on('unhandledRejection', (reason) => {
  rootLogger.error({ err: reason }, 'unhandled promise rejection')
})

process.on('uncaughtException', (err) => {
  rootLogger.fatal({ err }, 'uncaught exception')
  void shutdown('uncaughtException').then(() => process.exit(1))
})

try {
  const address = await app.listen({ host: config.host, port: config.port })
  rootLogger.info(
    {
      address,
      env: config.env,
      db: isDbReady() ? 'ready' : 'unavailable',
      pulseIntervalSec: config.pulseIntervalSec,
    },
    'new-pro started'
  )
} catch (err) {
  rootLogger.fatal({ err }, 'server failed to start')
  process.exit(1)
}
