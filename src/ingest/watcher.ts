import * as fs from 'node:fs';
import * as path from 'node:path';
import { watch as chokidarWatch, type FSWatcher } from 'chokidar';
import type { Lifecycle } from '../core/container.js';
import { createLogger } from '../core/logger.js';
import { EventBus } from '../core/event-bus.js';
import { getEnv } from '../env.js';
import { parseLines } from './parser.js';
import type { ParsedLogEntry } from '../types/log.js';

const log = createLogger('watcher');

/** Convert a simple glob pattern (supports `*` and `?`) to an anchored RegExp. */
function globToRegExp(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`);
}

/**
 * Watches the NewAPI log directory for changes.
 * Reads new lines incrementally and emits parsed entries via EventBus.
 *
 * NOTE: the store is in-memory, so on every restart the full history is
 * replayed from scratch. This is intentional: a persistent offset
 * checkpoint would skip history the fresh store needs (see ReplayGuard
 * for double-count protection when files are re-read).
 */
export class LogWatcher implements Lifecycle {
  private fileOffsets = new Map<string, number>();
  private watcher: FSWatcher | null = null;
  private bus: EventBus;

  constructor(bus: EventBus) {
    this.bus = bus;
  }

  /** Load all existing log files on startup */
  async start(): Promise<void> {
    const env = getEnv();
    const dir = env.LOG_DIR;
    const pattern = globToRegExp(env.LOG_PATTERN);

    let files: string[];
    try {
      files = fs.readdirSync(dir)
        .filter((f) => pattern.test(f))
        .sort();
    } catch (err) {
      log.error({ dir, err }, 'Cannot read log directory');
      // Still watch, so logs are picked up when the directory appears
      this.startWatching();
      return;
    }

    log.info({ count: files.length, dir, pattern: env.LOG_PATTERN }, 'Loading existing log files');

    const allEntries: ParsedLogEntry[] = [];
    for (const file of files) {
      const entries = await this.readNewLines(path.join(dir, file), 0);
      for (const entry of entries) {
        allEntries.push(entry);
      }
    }

    log.info({ entries: allEntries.length }, 'Historical entries loaded');

    // Emit in chunks, yielding to the event loop between batches so health
    // endpoints and the dashboard stay responsive during large history loads.
    const BATCH_SIZE = 5000;
    for (let i = 0; i < allEntries.length; i += BATCH_SIZE) {
      this.bus.emit('log:batch', allEntries.slice(i, i + BATCH_SIZE));
      await new Promise((resolve) => setImmediate(resolve));
    }

    this.startWatching();
  }

  async stop(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
      log.info('File watcher stopped');
    }
  }

  private startWatching(): void {
    const env = getEnv();
    const pattern = globToRegExp(env.LOG_PATTERN);

    log.info({ dir: env.LOG_DIR, pattern: env.LOG_PATTERN }, 'Starting file watcher');

    // usePolling: true is crucial for Docker mount volumes / shared filesystems.
    // Watch the directory and filter by pattern ourselves — chokidar's glob
    // form is unreliable across fs variants.
    this.watcher = chokidarWatch(env.LOG_DIR, {
      persistent: true,
      usePolling: true,
      interval: 1000,
      binaryInterval: 1000,
      awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 100 },
      ignoreInitial: true,
      depth: 0,
    });

    this.watcher.on('add', (filePath: string) => {
      if (!pattern.test(path.basename(filePath))) return;
      log.debug({ file: filePath }, 'New log file detected');
      void this.readNewLines(filePath, 0).then((entries) => this.emitEntries(entries));
    });

    this.watcher.on('change', (filePath: string) => {
      if (!pattern.test(path.basename(filePath))) return;
      const offset = this.fileOffsets.get(filePath) ?? 0;
      void this.readNewLines(filePath, offset).then((entries) => this.emitEntries(entries));
    });

    this.watcher.on('error', (err: unknown) => {
      log.error({ err }, 'File watcher error');
    });
  }

  private async readNewLines(filePath: string, offset: number): Promise<ParsedLogEntry[]> {
    try {
      const stat = await fs.promises.stat(filePath);
      // Truncated or rotated: start over from the beginning
      if (stat.size < offset) offset = 0;
      if (stat.size <= offset) return [];

      const handle = await fs.promises.open(filePath, 'r');
      try {
        const buffer = Buffer.alloc(stat.size - offset);
        await handle.read(buffer, 0, buffer.length, offset);
        this.fileOffsets.set(filePath, stat.size);
        return parseLines(buffer.toString('utf-8'), path.basename(filePath), getEnv().LOG_TZ);
      } finally {
        await handle.close();
      }
    } catch (err) {
      log.error({ file: filePath, err }, 'Error reading log file');
      return [];
    }
  }

  private emitEntries(entries: ParsedLogEntry[]): void {
    if (entries.length === 0) return;
    // Emit individually for real-time processing
    for (const entry of entries) {
      this.bus.emit('log:entry', entry);
    }
  }
}
