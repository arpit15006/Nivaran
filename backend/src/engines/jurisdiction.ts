import { booleanPointInPolygon, point } from '@turf/turf';
import type { Feature, Polygon, MultiPolygon } from 'geojson';
import type { Jurisdiction, Category } from '../config/domain.js';

export interface WardLike {
  id: string;
  name: string;
  zone: string;
  geojson: unknown; // GeoJSON Polygon | MultiPolygon | Feature
}

export interface JurisdictionResult {
  ward: WardLike | null;
  jurisdiction: Jurisdiction;
  reason: string;
}

// Normalize a stored geojson value into a turf-compatible geometry.
function asGeometry(geojson: unknown): Polygon | MultiPolygon | null {
  if (!geojson || typeof geojson !== 'object') return null;
  const g = geojson as { type?: string; geometry?: unknown; coordinates?: unknown };
  if (g.type === 'Feature' && g.geometry) return g.geometry as Polygon | MultiPolygon;
  if (g.type === 'Polygon' || g.type === 'MultiPolygon') return geojson as Polygon | MultiPolygon;
  return null;
}

/**
 * Deterministic jurisdiction resolution (PRD §5.2).
 *  1. Point-in-polygon over ward boundaries → which ward contains the point.
 *  2. Category-based authority rules decide JurisdictionType.
 *
 * Every output is reproducible and explained via `reason`.
 */
export function resolveJurisdiction(
  lat: number,
  lng: number,
  category: Category,
  wards: WardLike[],
): JurisdictionResult {
  const pt = point([lng, lat]);

  let containingWard: WardLike | null = null;
  for (const w of wards) {
    const geom = asGeometry(w.geojson);
    if (!geom) continue;
    const feature = { type: 'Feature', properties: {}, geometry: geom } as Feature<Polygon | MultiPolygon>;
    try {
      if (booleanPointInPolygon(pt, feature)) {
        containingWard = w;
        break;
      }
    } catch {
      // Malformed polygon — skip, do not let one bad ward break resolution.
    }
  }

  const jurisdiction = jurisdictionForCategory(category, containingWard !== null);
  const reason = containingWard
    ? `point (${lat.toFixed(5)}, ${lng.toFixed(5)}) inside ward "${containingWard.name}"; category ${category} → ${jurisdiction}`
    : `point (${lat.toFixed(5)}, ${lng.toFixed(5)}) outside all known wards; category ${category} → ${jurisdiction}`;

  return { ward: containingWard, jurisdiction, reason };
}

/**
 * Authority rules — which level of government owns a category.
 * A real deployment layers road-class GeoJSON (NH/SH/city) on top of this;
 * here we encode the canonical ownership rules deterministically.
 */
export function jurisdictionForCategory(category: Category, insideKnownWard: boolean): Jurisdiction {
  // Utilities are owned by the utility regardless of where they sit.
  if (category === 'ELECTRICITY') return 'UTILITY';
  if (category === 'WATER_SUPPLY') return 'UTILITY';

  // Heavy road/infrastructure always belongs to the State PWD.
  if (category === 'ROAD_DAMAGE') return 'STATE_PWD';

  // A pothole is the one category whose owner depends on the road it sits on:
  // inside a city ward it's a municipal road; outside, it's a state highway.
  if (category === 'POTHOLE') return insideKnownWard ? 'MUNICIPAL' : 'STATE_PWD';

  // Every other category is a municipal service (drainage, garbage, streetlight,
  // sewage, traffic signals, strays, etc.). These are the city's responsibility
  // whether or not the point falls inside a precisely-mapped ward boundary —
  // the nearest municipality still owns the service.
  return 'MUNICIPAL';
}
