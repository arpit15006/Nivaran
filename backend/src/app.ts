import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'node:crypto';
import pinoHttp from 'pino-http';
import { logger } from './logger.js';
import { corsOrigins } from './env.js';
import { errorHandler } from './http/errors.js';
import { apiLimiter } from './http/rateLimit.js';
import { authRouter } from './routes/auth.js';
import { complaintsRouter } from './routes/complaints.js';
import { departmentsRouter } from './routes/departments.js';
import { adminRouter } from './routes/admin.js';
import { healthRouter } from './routes/health.js';

export function buildApp() {
  const app = express();
  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(
    cors({
      origin: corsOrigins,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '256kb' }));
  app.use(cookieParser());

  // Request ID + structured request logging (correlation across the stack).
  app.use((req, res, next) => {
    const id = (req.headers['x-request-id'] as string) || randomUUID();
    res.setHeader('x-request-id', id);
    next();
  });
  app.use(
    pinoHttp({
      logger,
      genReqId: (_req, res) => res.getHeader('x-request-id') as string,
      autoLogging: { ignore: (req) => req.url === '/healthz' || req.url === '/readyz' },
    }),
  );

  // Health endpoints (unversioned, unauthenticated).
  app.use('/', healthRouter);

  // Versioned API.
  const v1 = express.Router();
  v1.use(apiLimiter);
  v1.use('/auth', authRouter);
  v1.use('/complaints', complaintsRouter);
  v1.use('/departments', departmentsRouter);
  v1.use('/admin', adminRouter);
  app.use('/api/v1', v1);

  app.use(errorHandler);
  return app;
}
