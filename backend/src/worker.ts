import { logger } from './logger.js';
import { startEscalationWorker } from './engines/escalation.js';

// Standalone escalation worker process (production deployment target).
const worker = startEscalationWorker();
logger.info('🟢 Nivaran escalation worker running');

async function shutdown(signal: string) {
  logger.info({ signal }, 'Worker shutting down');
  await worker.close();
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
