import { LifecycleManager } from './core/lifecycle.js';
import { createLogger, logger } from './core/logger.js';
import { loadConfig } from './config/env.js';
import { Database } from './core/db.js';
import { AnalyticsRepository } from './modules/analytics/analytics.repo.js';
import { AnalyticsService } from './modules/analytics/analytics.service.js';
import { LogsRepository } from './modules/logs/logs.repo.js';
import { LogsService } from './modules/logs/logs.service.js';
import { AlertsService } from './modules/alerts/alerts.service.js';
import { LivePoller } from './modules/live/polling.js';
import { WsHub } from './modules/live/ws.hub.js';
import { createApp } from './api/server.js';

/**
 * 组合根：唯一装配点。
 * 依赖方向：routes → service → repo → core/db，显式构造，无框架。
 */
async function bootstrap(): Promise<void> {
  const config = loadConfig();
  const log = logger;

  log.info({ env: config.NODE_ENV, port: config.PORT }, 'Starting New-Pro');

  // ─── core ───
  const db = Database.fromEnv();
  await db.connect();
  log.info('PostgreSQL connected');

  // ─── 仓库层 ───
  const analyticsRepo = new AnalyticsRepository(db);
  const logsRepo = new LogsRepository(db);

  // ─── 服务层 ───
  const analytics = new AnalyticsService(analyticsRepo);
  const logs = new LogsService(logsRepo);
  const alerts = new AlertsService(db);

  // ─── 实时层 ───
  const poller = new LivePoller(logsRepo);
  const wsHub = new WsHub(logs, poller);

  let ready = false;
  const app = await createApp({ analytics, logs, alerts, wsHub, isReady: () => ready });

  await app.listen({ port: config.PORT, host: config.HOST });
  log.info(`REST API: http://localhost:${config.PORT}/api/v1`);
  log.info(`WebSocket: ws://localhost:${config.PORT}/ws`);

  // ─── 生命周期 ───
  const lifecycle = new LifecycleManager();
  lifecycle.register('poller', poller);
  lifecycle.register('wsHub', wsHub);
  await lifecycle.startAll();
  ready = true;
  log.info('Ready');

  const shutdown = async (signal: string) => {
    log.info({ signal }, 'Shutting down...');
    ready = false;
    await lifecycle.stopAll();
    await db.close();
    await app.close();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

bootstrap().catch((err) => {
  createLogger('bootstrap').fatal({ err }, 'Fatal startup error');
  process.exit(1);
});
