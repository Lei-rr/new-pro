import type { ConsumeLogEntry } from '../types/log.js';

/** Max entries kept in each direction of the correlation maps. */
const MAX_MAP_SIZE = 50_000;

function evictOldest(map: Map<string, unknown>): void {
  if (map.size > MAX_MAP_SIZE) {
    const oldest = map.keys().next().value;
    if (oldest !== undefined) map.delete(oldest);
  }
}

/**
 * Bidirectional request correlation: matches GIN relay entries (client IP,
 * HTTP duration) with consume entries (billing params) by requestId.
 *
 * NewAPI writes the GIN line and the consume line at different times, in
 * either order. The correlator remembers whichever side arrived first and
 * resolves the pair when the second side shows up.
 */
export class RequestCorrelator {
  /** requestId -> client IP (GIN arrived first, waiting for consume) */
  private requestIpMap = new Map<string, string>();
  /** requestId -> consume entry (consume arrived first, waiting for GIN) */
  private pendingConsumeMap = new Map<string, ConsumeLogEntry>();

  /**
   * A GIN relay entry arrived. Returns the matching consume entry when the
   * consume side had arrived first (its `ip` is filled in), otherwise
   * records the requestId -> IP mapping and returns undefined.
   */
  onGin(requestId: string, ip: string): ConsumeLogEntry | undefined {
    const consume = this.pendingConsumeMap.get(requestId);
    if (consume !== undefined) {
      this.pendingConsumeMap.delete(requestId);
      consume.ip = ip;
      return consume;
    }
    this.requestIpMap.set(requestId, ip);
    evictOldest(this.requestIpMap);
    return undefined;
  }

  /**
   * A consume entry arrived. Returns the client IP when the GIN side had
   * arrived first (the entry's `ip` is filled in), otherwise queues the
   * entry for later correlation and returns undefined.
   */
  onConsume(entry: ConsumeLogEntry): string | undefined {
    const ip = this.requestIpMap.get(entry.requestId);
    if (ip !== undefined) {
      this.requestIpMap.delete(entry.requestId);
      entry.ip = ip;
      return ip;
    }
    this.pendingConsumeMap.set(entry.requestId, entry);
    evictOldest(this.pendingConsumeMap);
    return undefined;
  }
}
