import { describe, it, expect } from 'vitest';
import { applyGuardrails, type EscalationContext } from '../src/agents/escalationAgent.js';

function ctx(overrides: Partial<EscalationContext> = {}): EscalationContext {
  return {
    complaintId: 'c1',
    category: 'POTHOLE',
    severity: 'MEDIUM',
    rawText: 'pothole',
    ward: 'W1',
    ageHours: 30,
    overdueHours: 6,
    currentLevel: 0,
    steps: [
      { level: 1, authority: 'Zonal Officer', contact: null, slaHours: 24 },
      { level: 2, authority: 'City Commissioner', contact: null, slaHours: 48 },
    ],
    maxLevel: 2,
    avgResolveHours: 40,
    relatedOpenCount: 0,
    safetySignals: [],
    ...overrides,
  };
}

describe('escalation agent guardrails (deterministic, bounded)', () => {
  it('never targets a level at or below the current level', () => {
    const d = applyGuardrails(
      { targetLevel: 0, urgent: false, batch: false, priorityScore: 50, nextCheckHours: 24, reasoning: 'x' },
      ctx({ currentLevel: 1 }),
      'agent',
    );
    expect(d.targetLevel).toBeGreaterThan(1);
  });

  it('clamps a too-high target to the max configured level', () => {
    const d = applyGuardrails(
      { targetLevel: 99, urgent: true, batch: false, priorityScore: 90, nextCheckHours: 2, reasoning: 'jump' },
      ctx(),
      'agent',
    );
    expect(d.targetLevel).toBe(2);
    expect(d.skippedLevels).toBe(1); // floor was 1, jumped to 2
  });

  it('clamps nextCheckHours into [1, 168]', () => {
    const fast = applyGuardrails({ targetLevel: 1, urgent: false, batch: false, priorityScore: 50, nextCheckHours: 0, reasoning: '' }, ctx(), 'agent');
    expect(fast.nextCheckHours).toBeGreaterThanOrEqual(1);
    const slow = applyGuardrails({ targetLevel: 1, urgent: false, batch: false, priorityScore: 50, nextCheckHours: 9999, reasoning: '' }, ctx(), 'agent');
    expect(slow.nextCheckHours).toBeLessThanOrEqual(168);
  });

  it('forces urgent=true when safety signals are present, even if the model said false', () => {
    const d = applyGuardrails(
      { targetLevel: 1, urgent: false, batch: false, priorityScore: 10, nextCheckHours: 24, reasoning: '' },
      ctx({ safetySignals: ['school/children', 'open manhole'] }),
      'agent',
    );
    expect(d.urgent).toBe(true);
  });

  it('forces urgent=true for CRITICAL severity', () => {
    const d = applyGuardrails(
      { targetLevel: 1, urgent: false, batch: false, priorityScore: 10, nextCheckHours: 24, reasoning: '' },
      ctx({ severity: 'CRITICAL' }),
      'agent',
    );
    expect(d.urgent).toBe(true);
  });

  it('forces batch=true when a cluster of related complaints is open', () => {
    const d = applyGuardrails(
      { targetLevel: 1, urgent: false, batch: false, priorityScore: 10, nextCheckHours: 24, reasoning: '' },
      ctx({ relatedOpenCount: 5 }),
      'agent',
    );
    expect(d.batch).toBe(true);
  });

  it('keeps priorityScore within 0..100 and records the decision source', () => {
    const d = applyGuardrails(
      { targetLevel: 1, urgent: false, batch: false, priorityScore: 250, nextCheckHours: 24, reasoning: 'r' },
      ctx(),
      'fallback',
    );
    expect(d.priorityScore).toBeLessThanOrEqual(100);
    expect(d.priorityScore).toBeGreaterThanOrEqual(0);
    expect(d.source).toBe('fallback');
  });
});
