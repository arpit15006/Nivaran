import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { redisGeneral } from '../redis.js';

// Redis-backed so limits hold across multiple stateless API instances (PRD §13).
function makeLimiter(opts: { windowMs: number; max: number; prefix: string }) {
  return rateLimit({
    windowMs: opts.windowMs,
    max: opts.max,
    standardHeaders: true,
    legacyHeaders: false,
    store: new RedisStore({
      sendCommand: (command: string, ...args: string[]) => redisGeneral.call(command, ...args) as Promise<never>,
      prefix: `rl:${opts.prefix}:`,
    }),
    message: { error: { code: 'RATE_LIMITED', message: 'Too many requests, please slow down.' } },
  });
}

// Tight limit on auth endpoints (brute-force protection).
export const authLimiter = makeLimiter({ windowMs: 15 * 60_000, max: 30, prefix: 'auth' });
// Complaint creation is abuse-prone; cap per window.
export const complaintLimiter = makeLimiter({ windowMs: 60_000, max: 20, prefix: 'complaint' });
// General API limiter.
export const apiLimiter = makeLimiter({ windowMs: 60_000, max: 300, prefix: 'api' });
