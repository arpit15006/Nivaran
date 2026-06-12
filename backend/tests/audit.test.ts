import { describe, it, expect } from 'vitest';
import { _computeHash } from '../src/lib/audit.js';

describe('audit hash chain', () => {
  it('is deterministic for identical inputs', () => {
    const ts = '2026-01-01T00:00:00.000Z';
    const a = _computeHash('GENESIS', 'ROUTED', 'user1', { x: 1 }, ts);
    const b = _computeHash('GENESIS', 'ROUTED', 'user1', { x: 1 }, ts);
    expect(a).toBe(b);
  });

  it('changes when any field changes (tamper-evident)', () => {
    const ts = '2026-01-01T00:00:00.000Z';
    const base = _computeHash('GENESIS', 'ROUTED', 'user1', { x: 1 }, ts);
    expect(_computeHash('GENESIS', 'ROUTED', 'user1', { x: 2 }, ts)).not.toBe(base);
    expect(_computeHash('GENESIS', 'ESCALATED', 'user1', { x: 1 }, ts)).not.toBe(base);
    expect(_computeHash('OTHER', 'ROUTED', 'user1', { x: 1 }, ts)).not.toBe(base);
  });

  it('chains: each hash depends on the previous', () => {
    const ts = '2026-01-01T00:00:00.000Z';
    const h1 = _computeHash('GENESIS', 'CLASSIFIED', null, {}, ts);
    const h2 = _computeHash(h1, 'ROUTED', null, {}, ts);
    const h2Tampered = _computeHash('GENESIS', 'ROUTED', null, {}, ts);
    expect(h2).not.toBe(h2Tampered);
  });

  it('is independent of object key order (survives jsonb reordering)', () => {
    const ts = '2026-01-01T00:00:00.000Z';
    const a = _computeHash('GENESIS', 'ROUTED', null, { category: 'POTHOLE', slaHours: 48, ward: 'W1' }, ts);
    const b = _computeHash('GENESIS', 'ROUTED', null, { ward: 'W1', slaHours: 48, category: 'POTHOLE' }, ts);
    expect(a).toBe(b);
  });
});
