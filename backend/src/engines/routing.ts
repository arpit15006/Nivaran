import type { Category, Jurisdiction } from '../config/domain.js';

export interface RuleLike {
  id: string;
  category: string;
  jurisdiction: string;
  departmentId: string;
  slaHours: number;
  version: number;
  active: boolean;
}

export interface RoutingDecision {
  rule: RuleLike;
  departmentId: string;
  slaHours: number;
  slaDeadline: Date;
}

/**
 * Pure rule selection (PRD §5.2): pick the active, highest-version rule that
 * matches (category, jurisdiction). Deterministic, reproducible, unit-tested.
 * Returns null when no rule matches → caller routes to human triage.
 */
export function selectRule(
  rules: RuleLike[],
  category: Category,
  jurisdiction: Jurisdiction,
): RuleLike | null {
  const matches = rules.filter(
    (r) => r.active && r.category === category && r.jurisdiction === jurisdiction,
  );
  if (matches.length === 0) return null;
  // Highest version wins — the versioned rulebook is append-only.
  return matches.reduce((best, r) => (r.version > best.version ? r : best));
}

/**
 * Given a matched rule and the moment of routing, compute the SLA deadline.
 * `now` is injected for deterministic tests.
 */
export function decide(
  rules: RuleLike[],
  category: Category,
  jurisdiction: Jurisdiction,
  now: Date,
): RoutingDecision | null {
  const rule = selectRule(rules, category, jurisdiction);
  if (!rule) return null;
  const slaDeadline = new Date(now.getTime() + rule.slaHours * 3_600_000);
  return { rule, departmentId: rule.departmentId, slaHours: rule.slaHours, slaDeadline };
}
