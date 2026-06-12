import { describe, it, expect } from 'vitest';
import { classifyWithFallback } from '../src/services/classifier.js';

describe('deterministic fallback classifier', () => {
  it('classifies a pothole report', () => {
    const r = classifyWithFallback('There is a huge pothole on the main road');
    expect(r.category).toBe('POTHOLE');
    expect(r.source).toBe('fallback');
  });

  it('classifies garbage', () => {
    expect(classifyWithFallback('garbage not collected, trash piling up').category).toBe('GARBAGE');
  });

  it('detects critical severity hints', () => {
    const r = classifyWithFallback('transformer caught fire, electrocution danger, urgent');
    expect(r.severity).toBe('CRITICAL');
    expect(r.category).toBe('ELECTRICITY');
  });

  it('falls back to OTHER with low confidence when nothing matches', () => {
    const r = classifyWithFallback('the quick brown fox jumps');
    expect(r.category).toBe('OTHER');
    expect(r.confidence).toBeLessThan(0.55);
  });

  it('is deterministic', () => {
    const a = classifyWithFallback('streetlight not working dark street');
    const b = classifyWithFallback('streetlight not working dark street');
    expect(a).toEqual(b);
  });
});
