// Canonical civic complaint taxonomy. The classifier is constrained to these
// categories; routing rules are keyed on them. Changing this list is a
// deliberate, reviewed act (it affects the rulebook).

export const CATEGORIES = [
  'POTHOLE',
  'STREETLIGHT',
  'GARBAGE',
  'WATER_SUPPLY',
  'SEWAGE',
  'DRAINAGE',
  'ROAD_DAMAGE',
  'TRAFFIC_SIGNAL',
  'STRAY_ANIMALS',
  'ILLEGAL_CONSTRUCTION',
  'NOISE_POLLUTION',
  'TREE_FALL',
  'ELECTRICITY',
  'OTHER',
] as const;

export type Category = (typeof CATEGORIES)[number];

export const SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export type Severity = (typeof SEVERITIES)[number];

export const JURISDICTIONS = [
  'MUNICIPAL',
  'STATE_PWD',
  'NATIONAL_HIGHWAY',
  'PRIVATE',
  'UTILITY',
] as const;
export type Jurisdiction = (typeof JURISDICTIONS)[number];

export function isCategory(v: string): v is Category {
  return (CATEGORIES as readonly string[]).includes(v);
}
