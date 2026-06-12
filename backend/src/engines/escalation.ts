import { Queue, Worker, type Job, type ConnectionOptions } from 'bullmq';
import { prisma } from '../db.js';
import { redis } from '../redis.js';
import { logger } from '../logger.js';
import { appendEvent } from '../lib/audit.js';
import type { Status } from '@prisma/client';

export const ESCALATION_QUEUE = 'nivaran-escalation';

// BullMQ bundles its own ioredis copy; the shared instance is structurally
// compatible but nominally distinct, so present it as a ConnectionOptions.
const connection = redis as unknown as ConnectionOptions;

export interface EscalationJobData {
  complaintId: string;
  // The escalation level this timer is checking (0 = initial SLA on the dept).
  level: number;
}

// Statuses that mean "the complaint is done" — no escalation needed.
const TERMINAL: Status[] = ['RESOLVED', 'CLOSED'];

let queueSingleton: Queue<EscalationJobData> | null = null;

export function getEscalationQueue(): Queue<EscalationJobData> {
  if (!queueSingleton) {
    queueSingleton = new Queue<EscalationJobData>(ESCALATION_QUEUE, {
      connection,
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      },
    }) as Queue<EscalationJobData>;
  }
  return queueSingleton;
}

/**
 * Schedule an SLA timer to fire at `deadline`. The jobId is deterministic
 * (`complaintId:level`) so re-scheduling the same level is idempotent — a
 * duplicate enqueue cannot create two timers for the same checkpoint.
 */
export async function scheduleEscalation(complaintId: string, level: number, deadline: Date) {
  const delay = Math.max(0, deadline.getTime() - Date.now());
  await getEscalationQueue().add(
    'sla-check',
    { complaintId, level },
    // BullMQ custom job IDs may not contain ':'; use '__' as the separator.
    { delay, jobId: `${complaintId}__${level}` },
  );
  logger.debug({ complaintId, level, delayMs: delay }, 'Scheduled escalation timer');
}

/**
 * Process one SLA checkpoint. Idempotent and guarded by complaint state:
 * a job firing twice does not double-escalate (PRD §5.3).
 */
export async function processEscalationJob(data: EscalationJobData): Promise<void> {
  const { complaintId, level } = data;

  await prisma.$transaction(async (tx) => {
    const complaint = await tx.complaint.findUnique({ where: { id: complaintId } });
    if (!complaint) return;

    // Already resolved/closed → nothing to do.
    if (TERMINAL.includes(complaint.status)) return;

    // Idempotency guard: this checkpoint only acts if the complaint is still
    // sitting at `level`. If escalationLevel already advanced past it, a prior
    // run handled it — skip.
    if (complaint.escalationLevel !== level) return;

    // Find the next escalation step above the current level.
    const nextStep = await tx.escalationStep.findFirst({
      where: { departmentId: complaint.departmentId ?? undefined, level: level + 1 },
      orderBy: { level: 'asc' },
    });

    const now = new Date();

    if (!nextStep) {
      // No higher authority — mark breached but keep it visible at the top level.
      if (complaint.status !== 'BREACHED') {
        await tx.complaint.update({ where: { id: complaintId }, data: { status: 'BREACHED' } });
        await appendEvent(tx, {
          complaintId,
          kind: 'BREACHED',
          detail: { level, note: 'SLA breached; no further escalation level configured' },
        });
      }
      return;
    }

    // Escalate: advance level, set status, record breach + escalation, set the
    // next deadline using this step's own SLA.
    const newLevel = level + 1;
    const nextDeadline = new Date(now.getTime() + nextStep.slaHours * 3_600_000);

    await tx.complaint.update({
      where: { id: complaintId },
      data: {
        status: 'ESCALATED',
        escalationLevel: newLevel,
        slaDeadline: nextDeadline,
      },
    });

    await appendEvent(tx, {
      complaintId,
      kind: 'BREACHED',
      detail: { level, deadline: complaint.slaDeadline },
    });
    await appendEvent(tx, {
      complaintId,
      kind: 'ESCALATED',
      detail: {
        toLevel: newLevel,
        authority: nextStep.authority,
        contact: nextStep.contact,
        nextDeadline,
      },
    });

    // Enqueue the next-level timer (outside isn't possible in tx; schedule after).
    // We schedule here via the queue (Redis), which is fine inside the tx callback.
    await scheduleEscalation(complaintId, newLevel, nextDeadline);

    logger.info({ complaintId, toLevel: newLevel, authority: nextStep.authority }, 'Escalated complaint');
  });
}

/**
 * Reconciliation sweep (defense-in-depth, PRD §5.3): periodically re-check for
 * any complaint whose deadline has passed but is still open, and enqueue an
 * immediate check. Catches timers lost to infra failures.
 */
export async function reconcileOverdue(): Promise<number> {
  const overdue = await prisma.complaint.findMany({
    where: {
      slaDeadline: { lt: new Date() },
      status: { notIn: ['RESOLVED', 'CLOSED'] },
    },
    select: { id: true, escalationLevel: true },
    take: 500,
  });
  for (const c of overdue) {
    await scheduleEscalation(c.id, c.escalationLevel, new Date());
  }
  if (overdue.length) logger.info({ count: overdue.length }, 'Reconciliation enqueued overdue checks');
  return overdue.length;
}

/** Start the worker + a periodic reconciliation job. Call from worker.ts. */
export function startEscalationWorker(): Worker<EscalationJobData> {
  const worker = new Worker<EscalationJobData>(
    ESCALATION_QUEUE,
    async (job: Job<EscalationJobData>) => {
      if (job.name === 'reconcile') {
        await reconcileOverdue();
        return;
      }
      await processEscalationJob(job.data);
    },
    { connection, concurrency: 8 },
  );

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'Escalation job failed');
  });

  // Repeatable reconciliation every 2 minutes.
  void getEscalationQueue().add(
    'reconcile',
    { complaintId: '', level: 0 },
    { repeat: { every: 120_000 }, jobId: 'reconcile-sweep' },
  );

  logger.info('Escalation worker started');
  return worker;
}
