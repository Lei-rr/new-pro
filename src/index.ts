import { Container } from './core/container.js';
import { EventBus } from './core/event-bus.js';
import { logger } from './core/logger.js';
import { getEnv } from './env.js';
import { MemoryStore } from './store/memory.js';
import { LogWatcher } from './ingest/watcher.js';
import {
  AnalysisEngine,
  IpPlugin,
  CostPlugin,
  TokenPlugin,
  ErrorRatePlugin,
  ChannelHealthPlugin,
  AbuseDetectionPlugin,
} from './engine/index.js';
import { WsHub } from './ws/hub.js';
import { createApp } from './api/server.js';

async function bootstrap(): Promise<void> {
  const env = getEnv();
  const log = logger;

  log.info({ env: env.NODE_ENV, port: env.PORT }, 'Starting new-pro');

  // ─── Core (explicit wiring, no hidden singletons) ───
  const bus = new EventBus();
  const container = new Container();
  let ready = false;

  // ─── Store ───
  const store = new MemoryStore();
  container.register('store', store);

  // ─── Analysis Engine (plugin-based) ───
  const engine = new AnalysisEngine(bus, store);
  engine
    .use(new IpPlugin())
    .use(new CostPlugin())
    .use(new TokenPlugin())
    .use(new ErrorRatePlugin())
    .use(new ChannelHealthPlugin())
    .use(new AbuseDetectionPlugin());
  container.register('engine', engine);

  // ─── WebSocket Hub (registered before watcher so realtime listeners are ready) ───
  const wsHub = new WsHub(store, engine, bus);
  container.register('wsHub', wsHub);

  // ─── Ingest (full history replay on startup; store is in-memory) ───
  const watcher = new LogWatcher(bus);
  container.register('watcher', watcher);

  // ─── Wire EventBus → Store ───
  bus.on('log:batch', (entries) => store.appendBatch(entries));
  bus.on('log:entry', (entry) => store.append(entry));

  // ─── HTTP Server ───
  const app = await createApp(store, engine, { isReady: () => ready });
  wsHub.registerRoute(app);

  // ─── Listen first so health endpoints respond during history load ───
  const address = await app.listen({ port: env.PORT, host: env.HOST });
  log.info({ address }, 'Server listening');
  log.info(`REST API: http://localhost:${env.PORT}/api/v1/health/live`);
  log.info(`WebSocket: ws://localhost:${env.PORT}/ws`);
  log.info(`Metrics:   http://localhost:${env.PORT}/api/v1/metrics`);

  // ─── Start all lifecycle services (watcher loads history in background) ───
  await container.startAll();
  ready = true;
  log.info('Ready: ingest pipeline started');

  // ─── Graceful shutdown ───
  const shutdown = async (signal: string) => {
    log.info({ signal }, 'Shutting down...');
    ready = false;
    await container.stopAll();
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
