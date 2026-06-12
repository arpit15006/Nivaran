import { buildApp } from './app.js';
import { env } from './env.js';
import { logger } from './logger.js';
import { startEscalationWorker } from './engines/escalation.js';

const app = buildApp();

// In development we run the escalation worker in-process for convenience.
// In production, run it as a separate process (npm run start:worker) so the
// API and the worker scale independently (PRD §18).
if (env.NODE_ENV !== 'production') {
  startEscalationWorker();
}

const server = app.listen(env.PORT, () => {
  logger.info(`🟢 Nivaran API listening on http://localhost:${env.PORT}  (env: ${env.NODE_ENV})`);
});

function shutdown(signal: string) {
  logger.info({ signal }, 'Shutting down');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
