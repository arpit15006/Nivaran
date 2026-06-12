import { describe, it, expect } from 'vitest';
import { resolveJurisdiction, jurisdictionForCategory, type WardLike } from '../src/engines/jurisdiction.js';

const wards: WardLike[] = [
  {
    id: 'w1',
    name: 'Ward 1',
    zone: 'A',
    geojson: {
      type: 'Polygon',
      coordinates: [[
        [75.86, 22.72],
        [75.91, 22.72],
        [75.91, 22.77],
        [75.86, 22.77],
        [75.86, 22.72],
      ]],
    },
  },
];

describe('jurisdiction — point in polygon', () => {
  it('finds the containing ward', () => {
    const r = resolveJurisdiction(22.74, 75.88, 'POTHOLE', wards);
    expect(r.ward?.id).toBe('w1');
    expect(r.jurisdiction).toBe('MUNICIPAL');
  });

  it('returns no ward for a point outside all polygons', () => {
    const r = resolveJurisdiction(10, 10, 'POTHOLE', wards);
    expect(r.ward).toBeNull();
    expect(r.jurisdiction).toBe('STATE_PWD'); // outside known ward → PWD territory
  });

  it('produces a human-readable reason', () => {
    const r = resolveJurisdiction(22.74, 75.88, 'GARBAGE', wards);
    expect(r.reason).toContain('Ward 1');
  });

  it('does not crash on a malformed ward geometry', () => {
    const bad: WardLike[] = [{ id: 'x', name: 'bad', zone: 'z', geojson: { nope: true } }];
    const r = resolveJurisdiction(22.74, 75.88, 'POTHOLE', bad);
    expect(r.ward).toBeNull();
  });
});

describe('jurisdiction — authority rules', () => {
  it('routes utilities to UTILITY regardless of ward', () => {
    expect(jurisdictionForCategory('ELECTRICITY', true)).toBe('UTILITY');
    expect(jurisdictionForCategory('WATER_SUPPLY', false)).toBe('UTILITY');
  });

  it('routes road damage to STATE_PWD', () => {
    expect(jurisdictionForCategory('ROAD_DAMAGE', true)).toBe('STATE_PWD');
  });

  it('routes in-ward municipal issues to MUNICIPAL', () => {
    expect(jurisdictionForCategory('GARBAGE', true)).toBe('MUNICIPAL');
  });

  it('keeps municipal services MUNICIPAL even outside a mapped ward', () => {
    // Drainage/garbage/streetlight are city services regardless of exact ward.
    expect(jurisdictionForCategory('DRAINAGE', false)).toBe('MUNICIPAL');
    expect(jurisdictionForCategory('GARBAGE', false)).toBe('MUNICIPAL');
    expect(jurisdictionForCategory('STREETLIGHT', false)).toBe('MUNICIPAL');
  });

  it('keeps the pothole jurisdiction split (city road vs highway)', () => {
    expect(jurisdictionForCategory('POTHOLE', true)).toBe('MUNICIPAL');
    expect(jurisdictionForCategory('POTHOLE', false)).toBe('STATE_PWD');
  });
});
