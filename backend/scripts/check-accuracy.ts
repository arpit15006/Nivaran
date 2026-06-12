/**
 * CI regression gate (PRD §16/§17). Runs the deterministic routing-accuracy
 * harness over the labeled set and exits non-zero if accuracy drops below the
 * threshold — failing the build.
 */
import { runAccuracyEval } from '../src/services/accuracy.js';
import { prisma } from '../src/db.js';

const result = await runAccuracyEval();
console.log(`Routing accuracy: ${(result.accuracy * 100).toFixed(1)}% (${result.correct}/${result.total}), threshold ${(result.threshold * 100).toFixed(0)}%`);
if (result.misses.length) {
  console.log('Misses:');
  for (const m of result.misses) console.log(`  - "${m.rawText}" expected=${m.expected} got=${m.got}`);
}
await prisma.$disconnect();

if (!result.passed) {
  console.error('❌ Routing accuracy below threshold — failing build.');
  process.exit(1);
}
console.log('✅ Routing accuracy gate passed.');
