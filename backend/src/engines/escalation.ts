import { Queue, Worker, type Job, type ConnectionOptions } from 'bullmq';
import { prisma } from '../db.js';
import { redis } from '../redis.js';
import { logger } from '../logger.js';
import { appendEvent } from '../lib/audit.js';
import { gatherEscalationContext, decideEscalation } from '../agents/escalationAgent.js';
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
  // BullMQ custom job IDs may not contain ':'; use '__' as the separator.
  const jobId = `${complaintId}__${level}`;
  const queue = getEscalationQueue();

  // A job for this (complaint, level) may already exist — the deterministic
  // jobId is what makes scheduling idempotent. But that means a plain add() is a
  // silent no-op when one exists, so an expedite (breach-now / reconciliation)
  // would never fire. Instead: reschedule the pending timer if present.
  const existing = await queue.getJob(jobId);
  if (existing) {
    const state = await existing.getState().catch(() => 'unknown');
    if (state === 'delayed' || state === 'waiting' || state === 'waiting-children') {
      await existing.changeDelay(delay);
      logger.debug({ complaintId, level, delayMs: delay }, 'Rescheduled (expedited) escalation timer');
      return;
    }
    // Completed/failed/active — clear it so we can enqueue a fresh checkpoint.
    await existing.remove().catch(() => undefined);
  }

  await queue.add('sla-check', { complaintId, level }, { delay, jobId });
  logger.debug({ complaintId, level, delayMs: delay }, 'Scheduled escalation timer');
}

/**
 * Process one SLA checkpoint. Idempotent and guarded by complaint state
 * (PRD §5.3). The escalation DECISION is made by the agent (perceive → reason),
 * bounded by deterministic guardrails; the worker then ACTS on it atomically.
 */
export async function processEscalationJob(data: EscalationJobData): Promise<void> {
  const { complaintId, level } = data;

  // 1. Read + idempotency guards (no LLM call inside a transaction).
  const complaint = await prisma.complaint.findUnique({ where: { id: complaintId } });
  if (!complaint) return;
  if (TERMINAL.includes(complaint.status)) return;
  if (complaint.escalationLevel !== level) return; // a prior run already handled this checkpoint

  const steps = await prisma.escalationStep.findMany({
    where: { departmentId: complaint.departmentId ?? undefined },
    orderBy: { level: 'asc' },
  });
  const maxLevel = steps.length ? steps[steps.length - 1].level : level;

  // 2. Top of the chain — no higher authority. Final breach.
  if (level >= maxLevel) {
    await prisma.$transaction(async (tx) => {
      const fresh = await tx.complaint.findUnique({ where: { id: complaintId } });
      if (!fresh || TERMINAL.includes(fresh.status) || fresh.escalationLevel !== level) return;
      if (fresh.status !== 'BREACHED') {
        await tx.complaint.update({ where: { id: complaintId }, data: { status: 'BREACHED' } });
        await appendEvent(tx, {
          complaintId,
          kind: 'BREACHED',
          detail: { level, note: 'SLA breached at top of escalation chain; no higher authority configured.' },
        });
      }
    });
    return;
  }

  // 3. AGENT: perceive context, then decide the escalation action (outside tx).
  const ctx = await gatherEscalationContext(complaint, steps);
  const decision = await decideEscalation(ctx);
  const targetStep = steps.find((s) => s.level === decision.targetLevel) ?? steps.find((s) => s.level === level + 1)!;
  const now = new Date();
  const nextDeadline = new Date(now.getTime() + decision.nextCheckHours * 3_600_000);

  // 4. ACT atomically (re-check the guard inside the tx to stay idempotent).
  await prisma.$transaction(async (tx) => {
    const fresh = await tx.complaint.findUnique({ where: { id: complaintId } });
    if (!fresh || TERMINAL.includes(fresh.status) || fresh.escalationLevel !== level) return;

    await tx.complaint.update({
      where: { id: complaintId },
      data: { status: 'ESCALATED', escalationLevel: targetStep.level, slaDeadline: nextDeadline },
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
        fromLevel: level,
        toLevel: targetStep.level,
        skippedLevels: decision.skippedLevels,
        authority: targetStep.authority,
        contact: targetStep.contact,
        urgent: decision.urgent,
        batch: decision.batch,
        relatedOpenCount: ctx.relatedOpenCount,
        priorityScore: decision.priorityScore,
        safetySignals: ctx.safetySignals,
        nextDeadline,
        decidedBy: decision.source, // "agent" | "fallback"
        reasoning: decision.reasoning,
      },
    });
  });

  // 5. Schedule the next checkpoint at the agent-chosen cadence.
  await scheduleEscalation(complaintId, targetStep.level, nextDeadline);

  logger.info(
    {
      complaintId,
      fromLevel: level,
      toLevel: targetStep.level,
      skipped: decision.skippedLevels,
      urgent: decision.urgent,
      decidedBy: decision.source,
    },
    'Escalation agent acted',
  );
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
