import type { ParsedLogEntry } from '../types/log.js';
import { isConsume, isError, isGin } from '../types/log.js';

const MAX_IDENTITIES = 200_000;

/**
 * Unique identity per log line kind. A request produces one GIN line and
 * one consume line, so the kind prefix keeps them distinct. ERR/INFO lines
 * have no stable unique id — the timestamp+message triple identifies the
 * line itself.
 */
export function identityOf(entry: ParsedLogEntry): string | null {
  if (isConsume(entry)) return `consume|${entry.requestId}`;
  if (isGin(entry)) return `gin|${entry.requestId}`;
  if (isError(entry)) {
    return `err|${entry.requestId}|${entry.timestamp.getTime()}|${entry.message.slice(0, 40)}`;
  }
  if (entry.level === 'INFO') {
    return `info|${entry.requestId}|${entry.timestamp.getTime()}|${entry.message.slice(0, 40)}`;
  }
  return null;
}

/**
 * Replay protection: remembers ingested line identities and rejects
 * duplicates. Protects counters and alerts from double counting when a
 * file is re-read (rotation/truncation edge cases that bypass the offset
 * checkpoint). Bounded; cleared when the cap is hit.
 */
export class ReplayGuard {
  private seen = new Set<string>();

  /** Returns true when the entry was already ingested (should be skipped). */
  checkAndRemember(entry: ParsedLogEntry): boolean {
    const identity = identityOf(entry);
    if (identity === null) return false;

    if (this.seen.has(identity)) return true;
    if (this.seen.size >= MAX_IDENTITIES) this.seen.clear();
    this.seen.add(identity);
    return false;
  }
}
