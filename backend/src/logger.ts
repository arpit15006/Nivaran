import pino from 'pino';
import { env, isProd } from './env.js';

const usePretty = !isProd && env.NODE_ENV !== 'test';

export const logger = pino({
  level: env.NODE_ENV === 'test' ? 'silent' : isProd ? 'info' : 'debug',
  base: { service: 'nivaran-backend' },
  transport: usePretty
    ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss' } }
    : undefined,
});
