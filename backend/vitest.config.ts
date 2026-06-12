import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Pure-engine unit tests need no infra; provide dummy config so env.ts
    // validation passes without a real database/redis.
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
      REDIS_URL: 'redis://localhost:6379',
      JWT_ACCESS_SECRET: 'test-access-secret-0000',
      JWT_REFRESH_SECRET: 'test-refresh-secret-0000',
      GROQ_API_KEY: '',
    },
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/engines/**', 'src/lib/audit.ts', 'src/services/classifier.ts', 'src/services/accuracy.ts'],
      thresholds: { lines: 70, functions: 70 },
    },
  },
});
