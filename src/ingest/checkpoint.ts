import * as fs from 'node:fs';
import * as path from 'node:path';
import { createLogger } from '../core/logger.js';

const log = createLogger('checkpoint');

export interface CheckpointState {
  /** absolute file path -> last consumed byte offset */
  offsets: Record<string, number>;
}

/**
 * Persists ingest progress (per-file byte offsets) across restarts so the
 * watcher resumes incrementally instead of replaying all history.
 * Writes are atomic (tmp file + rename).
 */
export class CheckpointStore {
  constructor(private readonly filePath: string) {}

  load(): CheckpointState {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<CheckpointState>;
      if (!parsed || typeof parsed !== 'object' || !parsed.offsets) {
        throw new Error('invalid checkpoint payload');
      }
      const offsets: Record<string, number> = {};
      for (const [file, offset] of Object.entries(parsed.offsets)) {
        if (typeof offset === 'number' && offset >= 0) offsets[file] = offset;
      }
      log.info({ files: Object.keys(offsets).length, path: this.filePath }, 'Checkpoint loaded');
      return { offsets };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        log.warn({ err, path: this.filePath }, 'Checkpoint unreadable, starting fresh');
      }
      return { offsets: {} };
    }
  }

  async save(state: CheckpointState): Promise<void> {
    try {
      const dir = path.dirname(this.filePath);
      await fs.promises.mkdir(dir, { recursive: true });
      const tmp = `${this.filePath}.tmp`;
      await fs.promises.writeFile(tmp, JSON.stringify(state, null, 2));
      await fs.promises.rename(tmp, this.filePath);
    } catch (err) {
      log.error({ err, path: this.filePath }, 'Checkpoint save failed');
    }
  }
}
