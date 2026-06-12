import { describe, it, expect } from 'vitest';
import { selectRule, decide, type RuleLike } from '../src/engines/routing.js';

const rules: RuleLike[] = [
  { id: 'r1', category: 'POTHOLE', jurisdiction: 'MUNICIPAL', departmentId: 'roads', slaHours: 48, version: 1, active: true },
  { id: 'r1b', category: 'POTHOLE', jurisdiction: 'MUNICIPAL', departmentId: 'roads2', slaHours: 24, version: 2, active: true },
  { id: 'r1old', category: 'POTHOLE', jurisdiction: 'MUNICIPAL', departmentId: 'roadsX', slaHours: 99, version: 1, active: false },
  { id: 'r2', category: 'POTHOLE', jurisdiction: 'STATE_PWD', departmentId: 'pwd', slaHours: 72, version: 1, active: true },
  { id: 'r3', category: 'GARBAGE', jurisdiction: 'MUNICIPAL', departmentId: 'swm', slaHours: 24, version: 1, active: true },
];

describe('routing engine — selectRule', () => {
  it('selects the active highest-version rule for a (category, jurisdiction)', () => {
    const r = selectRule(rules, 'POTHOLE', 'MUNICIPAL');
    expect(r?.id).toBe('r1b');
    expect(r?.version).toBe(2);
  });

  it('respects jurisdiction', () => {
    expect(selectRule(rules, 'POTHOLE', 'STATE_PWD')?.departmentId).toBe('pwd');
  });

  it('ignores inactive rules', () => {
    const r = selectRule(rules, 'POTHOLE', 'MUNICIPAL');
    expect(r?.id).not.toBe('r1old');
  });

  it('returns null when no rule matches (→ triage)', () => {
    expect(selectRule(rules, 'TREE_FALL', 'MUNICIPAL')).toBeNull();
  });

  it('is deterministic — same inputs give same output', () => {
    const a = selectRule(rules, 'GARBAGE', 'MUNICIPAL');
    const b = selectRule(rules, 'GARBAGE', 'MUNICIPAL');
    expect(a).toEqual(b);
  });
});

describe('routing engine — decide (SLA deadline)', () => {
  it('computes the deadline from slaHours and now', () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    const d = decide(rules, 'POTHOLE', 'STATE_PWD', now);
    expect(d).not.toBeNull();
    expect(d!.slaHours).toBe(72);
    expect(d!.slaDeadline.toISOString()).toBe('2026-01-04T00:00:00.000Z');
  });

  it('returns null with no matching rule', () => {
    expect(decide(rules, 'NOISE_POLLUTION', 'MUNICIPAL', new Date())).toBeNull();
  });
});
