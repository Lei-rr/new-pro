import { Container } from './core/container.js';
import { logger } from './core/logger.js';
import { getEnv } from './env.js';
import { PgStore } from './db/pg-store.js';
import { PgPolling } from './db/polling.js';
import { AnalyticsService } from './service/analytics.js';
import { AlertEngine } from './service/alerts.js';
import { WsHub } from './ws/hub.js';
import { createApp } from './api/server.js';

async function bootstrap(): Promise<void> {
  const env = getEnv();
  const log = logger;

  log.info({ env: env.NODE_ENV, port: env.PORT }, 'Starting New-Pro');

  if (!env.SQL_DSN) {
    log.fatal('SQL_DSN is required (NewAPI PostgreSQL). Refusing to start.');
    process.exit(1);
  }

  let ready = false;

  // ─── 数据层：PG（唯一数据源） ───
  const pg = new PgStore(env.SQL_DSN);
  await pg.init();
  log.info('PostgreSQL connected');

  // ─── 领域层 ───
  const analytics = new AnalyticsService(pg);
  const alerts = new AlertEngine(pg);

  // ─── 实时增量（仅日志流：主键游标，压力≈0） ───
  const polling = new PgPolling(pg);

  // ─── 交付层 ───
  const wsHub = new WsHub(analytics, alerts, polling);
  const app = await createApp({ analytics, alerts, isReady: () => ready });
  wsHub.registerRoute(app);

  await app.listen({ port: env.PORT, host: env.HOST });
  log.info(`REST API: http://localhost:${env.PORT}/api/v1`);
  log.info(`WebSocket: ws://localhost:${env.PORT}/ws`);

  // ─── 生命周期 ───
  const container = new Container();
  container.register('alerts', alerts);
  container.register('polling', polling);
  container.register('wsHub', wsHub);
  await container.startAll();
  ready = true;
  log.info('Ready');

  // ─── Graceful shutdown ───
  const shutdown = async (signal: string) => {
    log.info({ signal }, 'Shutting down...');
    ready = false;
    await container.stopAll();
    await pg.close();
    await app.close();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

bootstrap().catch((err) => {
  logger.fatal({ err }, 'Fatal startup error');
  process.exit(1);
});
