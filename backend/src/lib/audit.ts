import { createHash } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../db.js';

export type AuditKind =
  | 'CLASSIFIED'
  | 'ROUTED'
  | 'ESCALATED'
  | 'RESOLVED'
  | 'BREACHED'
  | 'STATUS_CHANGE'
  | 'VIEWED';

const GENESIS = 'GENESIS';

/**
 * Canonical serialization: recursively sorts object keys and normalizes Dates
 * to ISO strings. This makes the hash independent of Postgres jsonb key
 * reordering, so verifyAudit() reproduces the exact bytes hashed at write time.
 */
function stableStringify(v: unknown): string {
  if (v === null || v === undefined) return 'null';
  if (v instanceof Date) return JSON.stringify(v.toISOString());
  if (typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  const obj = v as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

function computeHash(prevHash: string, kind: string, actorId: string | null, detail: unknown, ts: string): string {
  return createHash('sha256')
    .update(`${prevHash}|${kind}|${actorId ?? ''}|${stableStringify(detail)}|${ts}`)
    .digest('hex');
}

type Tx = Prisma.TransactionClient | PrismaClient;

/**
 * Append a tamper-evident event to a complaint's audit chain.
 * Runs inside the caller's transaction when provided so the prevHash read and
 * the insert are atomic (no interleaving writes corrupt the chain).
 */
export async function appendEvent(
  client: Tx,
  params: { complaintId: string; kind: AuditKind; actorId?: string | null; detail: Prisma.InputJsonValue },
) {
  const last = await client.statusEvent.findFirst({
    where: { complaintId: params.complaintId },
    orderBy: { seq: 'desc' },
    select: { hash: true },
  });
  const prevHash = last?.hash ?? GENESIS;
  const now = new Date();
  const ts = now.toISOString();
  const hash = computeHash(prevHash, params.kind, params.actorId ?? null, params.detail, ts);

  return client.statusEvent.create({
    data: {
      complaintId: params.complaintId,
      kind: params.kind,
      actorId: params.actorId ?? null,
      detail: params.detail,
      prevHash,
      hash,
      // Pin createdAt to the exact timestamp folded into the hash so
      // verifyAudit() can reproduce the chain deterministically.
      createdAt: now,
    },
  });
}

/**
 * Recompute a complaint's chain and report the first divergence, if any.
 * Note: createdAt is part of the hash, so we re-derive ts from the stored row.
 */
export async function verifyAudit(complaintId: string): Promise<{ ok: boolean; brokenAt?: string }> {
  const events = await prisma.statusEvent.findMany({
    where: { complaintId },
    orderBy: { seq: 'asc' },
  });
  let prevHash = GENESIS;
  for (const e of events) {
    if (e.prevHash !== prevHash) return { ok: false, brokenAt: e.id };
    const expected = computeHash(prevHash, e.kind, e.actorId, e.detail, e.createdAt.toISOString());
    if (expected !== e.hash) return { ok: false, brokenAt: e.id };
    prevHash = e.hash;
  }
  return { ok: true };
}

// Pure helper exported for unit tests.
export const _computeHash = computeHash;
