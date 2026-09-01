import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CheckpointStore } from './checkpoint.js';

describe('CheckpointStore', () => {
  it('round-trips offsets to disk', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'newpro-ckpt-'));
    const store = new CheckpointStore(join(dir, 'checkpoint.json'));
    await store.save({ offsets: { '/logs/one.log': 42, '/logs/two.log': 0 } });

    const loaded = store.load();
    expect(loaded.offsets['/logs/one.log']).toBe(42);
    expect(loaded.offsets['/logs/two.log']).toBe(0);
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns empty state when the file is missing or corrupt', () => {
    const dir = mkdtempSync(join(tmpdir(), 'newpro-ckpt-'));
    expect(new CheckpointStore(join(dir, 'nope.json')).load().offsets).toEqual({});
    rmSync(dir, { recursive: true, force: true });
  });
});
