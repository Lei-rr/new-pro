/**
 * Time & timezone utilities.
 *
 * NewAPI logs carry naive wall-clock timestamps in the source server's
 * timezone (LOG_TZ). All entries are stored as UTC instants, and day/hour
 * bucket keys are derived in LOG_TZ so boundaries match the business day
 * even when the container runs in a different timezone.
 */

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();
const offsetCache = new Map<string, number>();
const wallPartsCache = new Map<string, { date: string; hour: string; minute: string }>();
const WALL_PARTS_CACHE_MAX = 10_000;
const OFFSET_CACHE_MAX = 2_000;

function getFormatter(tz: string): Intl.DateTimeFormat {
  let dtf = formatterCache.get(tz);
  if (!dtf) {
    dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    formatterCache.set(tz, dtf);
  }
  return dtf;
}

interface WallComponents {
  y: number;
  mo: number;
  d: number;
  h: number;
  mi: number;
  s: number;
}

function wallComponentsOf(instantMs: number, tz: string): WallComponents {
  const parts: Record<string, string> = {};
  for (const p of getFormatter(tz).formatToParts(new Date(instantMs))) {
    parts[p.type] = p.value;
  }
  return {
    y: Number(parts.year),
    mo: Number(parts.month) - 1,
    d: Number(parts.day),
    h: Number(parts.hour),
    mi: Number(parts.minute),
    s: Number(parts.second),
  };
}

/**
 * Convert wall-clock components interpreted in the given IANA timezone
 * into a UTC epoch (ms). Iterative guess-and-correct: converges in 1-3
 * iterations for valid times, and deterministically for DST edges.
 * Offsets are cached per wall-clock hour.
 */
export function wallClockToEpochMs(
  y: number, mo: number, d: number,
  h: number, mi: number, s: number,
  tz: string,
): number {
  const cacheKey = `${tz}|${y}-${pad2(mo + 1)}-${pad2(d)}T${pad2(h)}`;
  const cached = offsetCache.get(cacheKey);
  if (cached !== undefined) {
    return Date.UTC(y, mo, d, h, mi, s) - cached;
  }

  const target = Date.UTC(y, mo, d, h, mi, s);
  let guess = target;
  for (let i = 0; i < 4; i++) {
    const w = wallComponentsOf(guess, tz);
    const wallUtc = Date.UTC(w.y, w.mo, w.d, w.h, w.mi, w.s);
    if (wallUtc === target) break;
    guess += target - wallUtc;
  }

  const offset = target - guess;
  if (offsetCache.size >= OFFSET_CACHE_MAX) offsetCache.clear();
  offsetCache.set(cacheKey, offset);
  return target - offset;
}

function wallPartsOf(d: Date, tz: string): { date: string; hour: string; minute: string } {
  const cacheKey = `${tz}|${Math.floor(d.getTime() / 60_000)}`;
  const cached = wallPartsCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const parts: Record<string, string> = {};
  for (const p of getFormatter(tz).formatToParts(d)) {
    parts[p.type] = p.value;
  }
  const result = {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: parts.hour,
    minute: parts.minute,
  };
  if (wallPartsCache.size >= WALL_PARTS_CACHE_MAX) wallPartsCache.clear();
  wallPartsCache.set(cacheKey, result);
  return result;
}

/**
 * Get date string for a Date (YYYY-MM-DD).
 * `tz === 'local'` uses server-local time; otherwise the given IANA zone.
 */
export function toDateString(d: Date, tz = 'local'): string {
  if (tz === 'local') {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }
  return wallPartsOf(d, tz).date;
}

/** Get hour key for bucketing ("YYYY-MM-DDTHH:00:00") in the given tz. */
export function toHourKey(d: Date, tz = 'local'): string {
  if (tz === 'local') {
    const c = new Date(d);
    c.setMinutes(0, 0, 0);
    return `${toDateString(c)}T${pad2(c.getHours())}:00:00`;
  }
  const p = wallPartsOf(d, tz);
  return `${p.date}T${p.hour}:00:00`;
}

/** Get minute key ("YYYY-MM-DDTHH:mm") in the given tz. */
export function toMinuteKey(d: Date, tz = 'local'): string {
  if (tz === 'local') {
    return `${toDateString(d)}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }
  const p = wallPartsOf(d, tz);
  return `${p.date}T${p.hour}:${p.minute}`;
}

/**
 * Epoch (ms) of the start of today (00:00:00) in the given timezone,
 * optionally shifted back by `daysBack` whole days.
 * `tz === 'local'` uses the server's local timezone.
 */
export function startOfDayMs(now: number, tz: string, daysBack = 0): number {
  const d = new Date(now);
  let y: number;
  let mo: number;
  let day: number;
  if (tz === 'local') {
    y = d.getFullYear();
    mo = d.getMonth();
    day = d.getDate();
  } else {
    const parts: Record<string, string> = {};
    for (const p of getFormatter(tz).formatToParts(d)) {
      parts[p.type] = p.value;
    }
    y = Number(parts.year);
    mo = Number(parts.month) - 1;
    day = Number(parts.day);
  }
  const start = wallClockToEpochMs(y, mo, day, 0, 0, 0, tz === 'local' ? localTzName() : tz);
  return start - daysBack * 86_400_000;
}

/** Server-local IANA timezone name (fallback for wallClockToEpochMs). */
function localTzName(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

/**
 * Convert an hour bucket key back to the epoch (ms) of its start,
 * interpreted in the same timezone used to produce the key.
 */
export function hourKeyToEpochMs(key: string, tz = 'local'): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/.exec(key);
  if (m) {
    if (tz === 'local') {
      return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime();
    }
    return wallClockToEpochMs(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6], tz);
  }
  return new Date(key).getTime();
}

/**
 * Convert a minute key ("YYYY-MM-DDTHH:mm") back to epoch (ms) in the
 * timezone used to produce the key.
 */
export function minuteKeyToEpochMs(key: string, tz = 'local'): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(key);
  if (m) {
    if (tz === 'local') {
      return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime();
    }
    return wallClockToEpochMs(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], 0, tz);
  }
  return new Date(key).getTime();
}
