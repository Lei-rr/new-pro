import type {
  ParsedLogEntry,
  SysLogEntry,
  GinLogEntry,
  ConsumeLogEntry,
  InfoLogEntry,
  ErrorLogEntry,
  ConsumeParams,
} from '../types/log.js';

// ─── Regex patterns ───

const SYS_RE = /^\[SYS\]\s+(\d{4}\/\d{2}\/\d{2}\s+-\s+\d{2}:\d{2}:\d{2})\s+\|\s+(.+)$/;

const GIN_RE =
  /^\[GIN\]\s+(\d{4}\/\d{2}\/\d{2}\s+-\s+\d{2}:\d{2}:\d{2})\s+\|\s+(\w+)\s+\|\s+(\S+)\s+\|\s+(\d+)\s+\|\s+([\d.]+(?:µs|ms|s|m|h)?\S*)\s+\|\s+([\d.:a-fA-F]+)\s+\|\s+(\w+)\s+(.+)$/;

const CONSUME_RE =
  /^\[INFO\]\s+(\d{4}\/\d{2}\/\d{2}\s+-\s+\d{2}:\d{2}:\d{2})\s+\|\s+(\S+)\s+\|\s+record consume log:\s+userId=(\d+),\s+params=(\{.+\})\s*$/;

const INFO_RE =
  /^\[INFO\]\s+(\d{4}\/\d{2}\/\d{2}\s+-\s+\d{2}:\d{2}:\d{2})\s+\|\s+(\S+)\s+\|\s+(.+)$/;

const ERR_RE =
  /^\[ERR\]\s+(\d{4}\/\d{2}\/\d{2}\s+-\s+\d{2}:\d{2}:\d{2})\s+\|\s+(\S+)\s+\|\s+(.+)$/;

// ─── Helpers ───

function parseTimestamp(ts: string): Date {
  // Naive local log timestamp ("2026/08/27 - 09:11:47").
  // Logs are written in server-local time (no timezone), parse components
  // as local time so instants match wall-clock shown in the log file.
  const m = /^(\d{4})\/(\d{2})\/(\d{2})\s+-\s+(\d{2}):(\d{2}):(\d{2})$/.exec(ts.trim());
  if (m) {
    return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  }
  return new Date(ts.replace(' - ', ' ').replace(/\//g, '-'));
}

function parseDurationMs(dur: string): number {
  const t = dur.trim();
  if (t.endsWith('µs')) return parseFloat(t) / 1000;
  if (t.endsWith('ms')) return parseFloat(t);
  if (t.endsWith('h'))  return parseFloat(t) * 3_600_000;
  if (t.endsWith('m'))  return parseFloat(t) * 60_000;
  if (t.endsWith('s'))  return parseFloat(t) * 1000;
  return parseFloat(t);
}

// ─── Public API ───

/**
 * Parse a single log line into a typed entry.
 * Returns null for unparseable or empty lines.
 */
export function parseLine(line: string, sourceFile: string): ParsedLogEntry | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed[0] !== '[') return null;

  let m: RegExpExecArray | null;

  // Consume log (match before generic INFO)
  m = CONSUME_RE.exec(trimmed);
  if (m) {
    try {
      const params: ConsumeParams = JSON.parse(m[4]);
      return {
        level: 'INFO',
        kind: 'consume',
        timestamp: parseTimestamp(m[1]),
        requestId: m[2],
        userId: parseInt(m[3], 10),
        params,
        sourceFile,
      } satisfies ConsumeLogEntry;
    } catch {
      // JSON parse failed, fall through
    }
  }

  // GIN
  m = GIN_RE.exec(trimmed);
  if (m) {
    return {
      level: 'GIN',
      timestamp: parseTimestamp(m[1]),
      routeType: m[2],
      requestId: m[3],
      statusCode: parseInt(m[4], 10),
      duration: m[5],
      durationMs: parseDurationMs(m[5]),
      ip: m[6].trim(),
      method: m[7].trim(),
      path: m[8].trim(),
      sourceFile,
    } satisfies GinLogEntry;
  }

  // SYS
  m = SYS_RE.exec(trimmed);
  if (m) {
    return {
      level: 'SYS',
      timestamp: parseTimestamp(m[1]),
      message: m[2].trim(),
      sourceFile,
    } satisfies SysLogEntry;
  }

  // ERR
  m = ERR_RE.exec(trimmed);
  if (m) {
    return {
      level: 'ERR',
      timestamp: parseTimestamp(m[1]),
      requestId: m[2],
      message: m[3].trim(),
      sourceFile,
    } satisfies ErrorLogEntry;
  }

  // Generic INFO
  m = INFO_RE.exec(trimmed);
  if (m) {
    return {
      level: 'INFO',
      kind: 'info',
      timestamp: parseTimestamp(m[1]),
      requestId: m[2],
      message: m[3].trim(),
      sourceFile,
    } satisfies InfoLogEntry;
  }

  return null;
}

/**
 * Parse multiple lines at once (for file reads).
 */
export function parseLines(text: string, sourceFile: string): ParsedLogEntry[] {
  const entries: ParsedLogEntry[] = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const entry = parseLine(lines[i], sourceFile);
    if (entry) entries.push(entry);
  }
  return entries;
}
