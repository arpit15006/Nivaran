import { prisma } from '../db.js';
import { resolveJurisdiction } from '../engines/jurisdiction.js';
import { selectRule } from '../engines/routing.js';
import type { Category } from '../config/domain.js';

export interface AccuracyResult {
  total: number;
  correct: number;
  accuracy: number;
  threshold: number;
  passed: boolean;
  misses: Array<{ rawText: string; expected: string; got: string | null }>;
}

// CI regression gate (PRD §16): routing accuracy must not drop below this.
export const ACCURACY_THRESHOLD = 0.9;

/**
 * Evaluate the DETERMINISTIC routing layer over the labeled set. This measures
 * the rule engine (jurisdiction + rulebook) given the true category — NOT the
 * LLM — because routing correctness is the integrity property we gate on.
 */
export async function runAccuracyEval(): Promise<AccuracyResult> {
  const [labeled, wards, rules, depts] = await Promise.all([
    prisma.labeledComplaint.findMany(),
    prisma.ward.findMany(),
    prisma.routingRule.findMany({ where: { active: true } }),
    prisma.department.findMany({ select: { id: true, name: true } }),
  ]);
  const deptName = new Map(depts.map((d) => [d.id, d.name]));

  let correct = 0;
  const misses: AccuracyResult['misses'] = [];

  for (const lc of labeled) {
    const jur = resolveJurisdiction(lc.lat, lc.lng, lc.trueCategory as Category, wards);
    const rule = selectRule(rules, lc.trueCategory as Category, jur.jurisdiction);
    const got = rule ? deptName.get(rule.departmentId) ?? null : null;
    if (got === lc.trueDepartment) correct++;
    else misses.push({ rawText: lc.rawText, expected: lc.trueDepartment, got });
  }

  const total = labeled.length;
  const accuracy = total ? correct / total : 1;
  return {
    total,
    correct,
    accuracy,
    threshold: ACCURACY_THRESHOLD,
    passed: accuracy >= ACCURACY_THRESHOLD,
    misses,
  };
}
