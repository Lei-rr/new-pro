import pino from 'pino';
import { getEnv } from '../env.js';

export function createLogger(name?: string) {
  const env = getEnv();
  const opts: pino.LoggerOptions = {
    level: env.LOG_LEVEL,
    ...(name && { name }),
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

  return pino(opts);
}

export const logger = createLogger('analytics');
export type Logger = ReturnType<typeof createLogger>;
