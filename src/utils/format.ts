/**
 * Quota units per cost unit (NewAPI convention: 500,000 quota = 1).
 * Centralized to avoid magic numbers scattered across modules.
 */
export const QUOTA_PER_COST_UNIT = 500_000;

/**
 * Format quota value to human-readable cost.
 * NewAPI uses 500,000 quota = 1 unit of currency.
 */
export function quotaToCost(quota: number): number {
  return quota / QUOTA_PER_COST_UNIT;
}

/**
 * Format large numbers with K/M/B suffixes.
 */
export function formatNumber(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Get date string for a Date (YYYY-MM-DD) in server-local time.
 * Log timestamps are naive local time, so bucket keys must be local too.
 */
export function toDateString(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/**
 * Get local hour key for bucketing ("YYYY-MM-DDTHH:00:00").
 */
export function toHourKey(d: Date): string {
  const c = new Date(d);
  c.setMinutes(0, 0, 0);
  return `${toDateString(c)}T${pad2(c.getHours())}:00:00`;
}

/**
 * Get local minute key ("YYYY-MM-DDTHH:mm").
 */
export function toMinuteKey(d: Date): string {
  return `${toDateString(d)}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/**
 * Convert a simple glob pattern (supports `*` and `?`) to an anchored RegExp.
 */
export function globToRegExp(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`);
}
