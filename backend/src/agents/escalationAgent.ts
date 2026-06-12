import Groq from 'groq-sdk';
import type { Complaint, EscalationStep } from '@prisma/client';
import { env, hasGroq } from '../env.js';
import { logger } from '../logger.js';
import { prisma } from '../db.js';

/**
 * The Escalation Agent (PRD §5.3, agentic layer).
 *
 * Routing stays deterministic for auditability. Escalation is where judgment
 * genuinely helps, so this is a real agent: it PERCEIVES context (severity, how
 * long the complaint has been ignored, the department's historical resolution
 * speed, a cluster of related open complaints, and safety signals), DECIDES an
 * escalation action (which level to jump to, whether to flag urgent, how soon to
 * re-check, whether to batch), and the worker ACTS on it.
 *
 * Every agent decision passes through deterministic GUARDRAILS and is recorded
 * with full reasoning — so we are "agentic where judgment adds value,
 * deterministic where accountability demands it."
 */

const groq = hasGroq ? new Groq({ apiKey: env.GROQ_API_KEY }) : null;

// Safety signals that justify skipping escalation levels (life/safety risk).
const SAFETY_PATTERNS: Array<{ tag: string; re: RegExp }> = [
  { tag: 'school/children', re: /\b(school|children|child|kids|playground)\b/i },
  { tag: 'hospital', re: /\b(hospital|clinic|patients?)\b/i },
  { tag: 'open manhole', re: /\b(open\s+)?manhole|sinkhole|open\s+drain\b/i },
  { tag: 'electrical', re: /\b(live\s*wire|electrocut|transformer|sparking|high\s*tension)\b/i },
  { tag: 'fire/gas', re: /\b(fire|gas\s*leak|explosion|blast)\b/i },
  { tag: 'collapse', re: /\b(collapse|collapsed|falling|fell)\b/i },
  { tag: 'flooding', re: /\b(flood|drowning|submerged|waterlogg)/i },
];

export interface EscalationContext {
  complaintId: string;
  category: string;
  severity: string;
  rawText: string;
  ward: string | null;
  ageHours: number; // since filing
  overdueHours: number; // past the current deadline
  currentLevel: number;
  steps: Array<{ level: number; authority: string; contact: string | null; slaHours: number }>;
  maxLevel: number;
  avgResolveHours: number | null; // department's historical resolution speed
  relatedOpenCount: number; // cluster: same category + ward, still open
  safetySignals: string[];
}

export interface EscalationDecision {
  targetLevel: number;
  urgent: boolean;
  batch: boolean;
  priorityScore: number; // 0..100
  nextCheckHours: number;
  reasoning: string;
  source: 'agent' | 'fallback';
  skippedLevels: number; // >0 means the agent jumped levels
}

// --- Perception -------------------------------------------------------------

export async function gatherEscalationContext(
  complaint: Complaint,
  steps: EscalationStep[],
): Promise<EscalationContext> {
  const now = Date.now();
  const ageHours = (now - complaint.createdAt.getTime()) / 3_600_000;
  const overdueHours = complaint.slaDeadline ? Math.max(0, (now - complaint.slaDeadline.getTime()) / 3_600_000) : 0;

  // Department's historical resolution speed (judgment input).
  const resolved = await prisma.complaint.findMany({
    where: { departmentId: complaint.departmentId ?? undefined, status: 'RESOLVED', resolvedAt: { not: null } },
    select: { createdAt: true, resolvedAt: true },
    take: 100,
  });
  const avgResolveHours =
    resolved.length === 0
      ? null
      : resolved.reduce((s, r) => s + (r.resolvedAt!.getTime() - r.createdAt.getTime()) / 3_600_000, 0) / resolved.length;

  // Cluster: other open complaints of the same category in the same ward.
  const relatedOpenCount = await prisma.complaint.count({
    where: {
      id: { not: complaint.id },
      category: complaint.category,
      wardId: complaint.wardId ?? undefined,
      status: { notIn: ['RESOLVED', 'CLOSED'] },
    },
  });

  const safetySignals = SAFETY_PATTERNS.filter((p) => p.re.test(complaint.rawText)).map((p) => p.tag);

  const sortedSteps = [...steps].sort((a, b) => a.level - b.level);
  return {
    complaintId: complaint.id,
    category: complaint.category,
    severity: complaint.severity,
    rawText: complaint.rawText,
    ward: null,
    ageHours: Math.round(ageHours * 10) / 10,
    overdueHours: Math.round(overdueHours * 10) / 10,
    currentLevel: complaint.escalationLevel,
    steps: sortedSteps.map((s) => ({ level: s.level, authority: s.authority, contact: s.contact, slaHours: s.slaHours })),
    maxLevel: sortedSteps.length ? sortedSteps[sortedSteps.length - 1].level : complaint.escalationLevel,
    avgResolveHours: avgResolveHours === null ? null : Math.round(avgResolveHours * 10) / 10,
    relatedOpenCount,
    safetySignals,
  };
}

// --- Decision (LLM proposal + deterministic guardrails) ---------------------

const SYSTEM = `You are the escalation agent for a civic grievance system. A complaint has just breached its deadline.
Decide how to escalate it. You may JUMP multiple levels for genuine safety risks, and choose how soon to re-check.
Return ONLY JSON: {"targetLevel": <int>, "urgent": <bool>, "batch": <bool>, "priorityScore": <0-100>, "nextCheckHours": <number>, "reasoning": "<one sentence>"}.
Rules of thumb:
- Higher severity, longer overdue, and safety signals (schools, open manholes, live wires, fire/gas, collapse) justify jumping levels and a shorter nextCheckHours.
- If many related complaints are open in the same area, consider batch=true and raise priority.
- If the department historically resolves slowly, escalate sooner.
- Never target a level at or below the current level. Keep reasoning to one sentence.`;

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Deterministic guardrails applied to whatever the LLM proposes. Pure and
 * unit-tested: the agent advises, this function guarantees a valid, bounded,
 * auditable action.
 */
export function applyGuardrails(
  proposal: { targetLevel: number; urgent: boolean; batch: boolean; priorityScore: number; nextCheckHours: number; reasoning: string },
  ctx: EscalationContext,
  source: 'agent' | 'fallback',
): EscalationDecision {
  const floor = ctx.currentLevel + 1;
  const targetLevel = clamp(Math.round(proposal.targetLevel || floor), floor, Math.max(floor, ctx.maxLevel));
  const stepSla = ctx.steps.find((s) => s.level === targetLevel)?.slaHours ?? 24;
  const nextCheckHours = clamp(Number(proposal.nextCheckHours) || stepSla, 1, 168);
  return {
    targetLevel,
    urgent: Boolean(proposal.urgent) || ctx.safetySignals.length > 0 || ctx.severity === 'CRITICAL',
    batch: Boolean(proposal.batch) || ctx.relatedOpenCount >= 3,
    priorityScore: clamp(Math.round(proposal.priorityScore || severityScore(ctx)), 0, 100),
    nextCheckHours: Math.round(nextCheckHours * 10) / 10,
    reasoning: (proposal.reasoning || '').slice(0, 280),
    source,
    skippedLevels: targetLevel - floor,
  };
}

function severityScore(ctx: EscalationContext): number {
  const base = { LOW: 25, MEDIUM: 50, HIGH: 75, CRITICAL: 95 }[ctx.severity] ?? 50;
  return clamp(base + ctx.safetySignals.length * 5 + Math.min(ctx.overdueHours, 20), 0, 100);
}

// Deterministic fallback used when the LLM is unavailable or returns garbage.
function fallbackDecision(ctx: EscalationContext): EscalationDecision {
  const floor = ctx.currentLevel + 1;
  // Safety/critical issues skip to the top of the chain; otherwise step up one.
  const target = ctx.safetySignals.length > 0 || ctx.severity === 'CRITICAL' ? ctx.maxLevel : floor;
  const reasoning =
    ctx.safetySignals.length > 0
      ? `Deterministic fallback: safety signals (${ctx.safetySignals.join(', ')}) → escalate to top authority.`
      : 'Deterministic fallback: step up one escalation level.';
  return applyGuardrails(
    {
      targetLevel: target,
      urgent: ctx.safetySignals.length > 0 || ctx.severity === 'CRITICAL',
      batch: ctx.relatedOpenCount >= 3,
      priorityScore: severityScore(ctx),
      nextCheckHours: ctx.steps.find((s) => s.level === target)?.slaHours ?? 24,
      reasoning,
    },
    ctx,
    'fallback',
  );
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error('agent timeout')), ms))]);
}

/** Perceive → decide. Always returns a valid, bounded decision (never throws). */
export async function decideEscalation(ctx: EscalationContext): Promise<EscalationDecision> {
  if (!groq) return fallbackDecision(ctx);

  const userPayload = {
    category: ctx.category,
    severity: ctx.severity,
    complaintText: ctx.rawText.slice(0, 600),
    hoursSinceFiled: ctx.ageHours,
    hoursOverdue: ctx.overdueHours,
    currentLevel: ctx.currentLevel,
    availableLevels: ctx.steps.filter((s) => s.level > ctx.currentLevel),
    departmentAvgResolveHours: ctx.avgResolveHours,
    relatedOpenComplaintsNearby: ctx.relatedOpenCount,
    safetySignals: ctx.safetySignals,
  };

  try {
    const completion = await withTimeout(
      groq.chat.completions.create({
        model: env.GROQ_MODEL,
        temperature: 0.2,
        max_tokens: 250,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: JSON.stringify(userPayload) },
        ],
      }),
      8000,
    );
    const raw = completion.choices[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const decision = applyGuardrails(
      {
        targetLevel: Number(parsed.targetLevel),
        urgent: Boolean(parsed.urgent),
        batch: Boolean(parsed.batch),
        priorityScore: Number(parsed.priorityScore),
        nextCheckHours: Number(parsed.nextCheckHours),
        reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : '',
      },
      ctx,
      'agent',
    );
    logger.info({ complaintId: ctx.complaintId, decision }, 'Escalation agent decided');
    return decision;
  } catch (err) {
    logger.warn({ err, complaintId: ctx.complaintId }, 'Escalation agent failed; using deterministic fallback');
    return fallbackDecision(ctx);
  }
}
