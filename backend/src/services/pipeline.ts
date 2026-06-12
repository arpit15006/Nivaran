import { prisma } from '../db.js';
import { logger } from '../logger.js';
import { classify, CONFIDENCE_THRESHOLD } from './classifier.js';
import { resolveJurisdiction } from '../engines/jurisdiction.js';
import { decide } from '../engines/routing.js';
import { scheduleEscalation } from '../engines/escalation.js';
import { appendEvent } from '../lib/audit.js';
import type { Category } from '../config/domain.js';

export interface IntakeInput {
  reporterId: string;
  rawText: string;
  lat: number;
  lng: number;
  photoKey?: string | null;
  voiceKey?: string | null;
  imageUrl?: string; // signed/temporary URL for vision classification only
}

/**
 * The core intake pipeline (PRD §5): the LLM perceives, deterministic engines
 * decide. Produces a fully-routed complaint with an immutable audit trail and a
 * durable SLA escalation timer — or parks it in human triage on low confidence.
 */
export async function intakeComplaint(input: IntakeInput) {
  // 1. Perception (LLM only) — category, severity, confidence.
  const classification = await classify({ text: input.rawText, imageUrl: input.imageUrl });

  // 2. Deterministic jurisdiction resolution (point-in-polygon + authority rules).
  const wards = await prisma.ward.findMany();
  const jur = resolveJurisdiction(input.lat, input.lng, classification.category as Category, wards);

  // 3. Deterministic routing from the versioned rulebook.
  const rules = await prisma.routingRule.findMany({ where: { active: true } });
  const now = new Date();
  const decision = decide(rules, classification.category as Category, jur.jurisdiction, now);

  const lowConfidence = classification.confidence < CONFIDENCE_THRESHOLD;
  const needsTriage = lowConfidence || decision === null;

  const result = await prisma.$transaction(async (tx) => {
    const complaint = await tx.complaint.create({
      include: { department: true, ward: true },
      data: {
        reporterId: input.reporterId,
        rawText: input.rawText,
        photoKey: input.photoKey ?? null,
        voiceKey: input.voiceKey ?? null,
        category: classification.category,
        severity: classification.severity,
        lat: input.lat,
        lng: input.lng,
        wardId: jur.ward?.id ?? null,
        jurisdiction: jur.jurisdiction,
        classifierConfidence: classification.confidence,
        classifierSource: classification.source,
        // Routed vs parked-in-triage.
        departmentId: needsTriage ? null : decision!.departmentId,
        appliedRuleId: needsTriage ? null : decision!.rule.id,
        appliedRuleVersion: needsTriage ? null : decision!.rule.version,
        slaDeadline: needsTriage ? null : decision!.slaDeadline,
        status: needsTriage ? 'TRIAGE' : 'ROUTED',
      },
    });

    await appendEvent(tx, {
      complaintId: complaint.id,
      kind: 'CLASSIFIED',
      actorId: input.reporterId,
      detail: {
        category: classification.category,
        severity: classification.severity,
        confidence: classification.confidence,
        source: classification.source,
        jurisdiction: jur.jurisdiction,
        jurisdictionReason: jur.reason,
        ward: jur.ward?.name ?? null,
      },
    });

    if (!needsTriage) {
      await appendEvent(tx, {
        complaintId: complaint.id,
        kind: 'ROUTED',
        detail: {
          departmentId: decision!.departmentId,
          ruleId: decision!.rule.id,
          ruleVersion: decision!.rule.version,
          slaHours: decision!.slaHours,
          slaDeadline: decision!.slaDeadline,
          reason: `category=${classification.category} jurisdiction=${jur.jurisdiction} → rule v${decision!.rule.version}`,
        },
      });
    } else {
      await appendEvent(tx, {
        complaintId: complaint.id,
        kind: 'STATUS_CHANGE',
        detail: {
          to: 'TRIAGE',
          reason: lowConfidence
            ? `classifier confidence ${classification.confidence.toFixed(2)} < ${CONFIDENCE_THRESHOLD}`
            : `no routing rule for category=${classification.category} jurisdiction=${jur.jurisdiction}`,
        },
      });
    }

    return complaint;
  });

  // 4. Durable SLA escalation timer — scheduled after the row exists.
  if (!needsTriage && decision) {
    await scheduleEscalation(result.id, 0, decision.slaDeadline);
  }

  logger.info(
    { complaintId: result.id, category: classification.category, status: result.status, source: classification.source },
    'Complaint intake complete',
  );
  return result;
}
