import pino from 'pino';
import type { LoggerOptions } from 'pino';
import { loadConfig } from '../config/env.js';

/**
 * Shared pino options: JSON structured logs in production/test,
 * pretty-printed in development.
 */
export function buildLoggerOptions(name?: string): LoggerOptions {
  const env = loadConfig();
  const opts: LoggerOptions = {
    level: env.LOG_LEVEL,
    ...(name && { name }),
    // Redact request URLs (they may carry ?api_key= from legacy clients)
    // and sensitive headers from structured logs.
    redact: {
      paths: ['req.url', 'res.headers["set-cookie"]'],
      censor: '[REDACTED]',
    },
  };

  if (env.NODE_ENV === 'development') {
    opts.transport = {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss.l',
        ignore: 'pid,hostname',
      },
    };
  }

  return opts;
}

export function createLogger(name?: string) {
  return pino(buildLoggerOptions(name));
}

export const logger = createLogger('analytics');
export type Logger = ReturnType<typeof createLogger>;
