import IORedis from 'ioredis';
import { env } from './env.js';

// BullMQ requires maxRetriesPerRequest: null on its connection.
export const redis = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
});

// A second connection for general-purpose use (rate limiting, cache).
export const redisGeneral = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
});
