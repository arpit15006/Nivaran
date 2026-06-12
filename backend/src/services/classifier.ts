import Groq from 'groq-sdk';
import { env, hasGroq } from '../env.js';
import { logger } from '../logger.js';
import { CATEGORIES, SEVERITIES, isCategory, type Category, type Severity } from '../config/domain.js';

export interface ClassifierInput {
  text: string;
  // Optional image as a data URL or https URL for vision models.
  imageUrl?: string;
}

export interface ClassifierResult {
  category: Category;
  severity: Severity;
  confidence: number; // 0..1
  source: 'llm' | 'fallback';
}

// Below this confidence, the caller routes to a human-triage queue (PRD §5.1).
export const CONFIDENCE_THRESHOLD = 0.55;

const groq = hasGroq ? new Groq({ apiKey: env.GROQ_API_KEY }) : null;

const SYSTEM_PROMPT = `You are a civic complaint classifier for an Indian municipal grievance system.
Classify the complaint into exactly one category and a severity.
Return ONLY compact JSON: {"category": <CATEGORY>, "severity": <SEVERITY>, "confidence": <0..1>}.
Allowed categories: ${CATEGORIES.join(', ')}.
Allowed severities: ${SEVERITIES.join(', ')}.
Do not include location, department, or any other field. confidence is your calibrated certainty.`;

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('classifier timeout')), ms)),
  ]);
}

async function classifyWithLLM(input: ClassifierInput): Promise<ClassifierResult | null> {
  if (!groq) return null;

  const userContent: Groq.Chat.Completions.ChatCompletionContentPart[] = [
    { type: 'text', text: `Complaint: ${input.text.slice(0, 2000)}` },
  ];
  if (input.imageUrl) {
    userContent.push({ type: 'image_url', image_url: { url: input.imageUrl } });
  }

  const attempt = async () => {
    const completion = await groq.chat.completions.create({
      model: env.GROQ_MODEL,
      temperature: 0,
      max_tokens: 120,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
    });
    const raw = completion.choices[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(raw) as { category?: string; severity?: string; confidence?: number };
    const category = typeof parsed.category === 'string' ? parsed.category.toUpperCase() : '';
    const severity = typeof parsed.severity === 'string' ? parsed.severity.toUpperCase() : '';
    if (!isCategory(category) || !(SEVERITIES as readonly string[]).includes(severity)) {
      throw new Error('LLM returned out-of-vocabulary label');
    }
    const confidence = Math.max(0, Math.min(1, Number(parsed.confidence ?? 0.7)));
    return { category, severity: severity as Severity, confidence, source: 'llm' as const };
  };

  // Retry with backoff (PRD §5.1).
  const delays = [0, 300, 800];
  for (let i = 0; i < delays.length; i++) {
    if (delays[i] > 0) await new Promise((r) => setTimeout(r, delays[i]));
    try {
      return await withTimeout(attempt(), 8000);
    } catch (err) {
      logger.warn({ err, attempt: i + 1 }, 'LLM classify attempt failed');
    }
  }
  return null;
}

// ---- Deterministic fallback (keyword rules) --------------------------------
// Used when the LLM is unavailable or low-confidence. Reproducible by design.
const KEYWORDS: Array<{ category: Category; words: string[] }> = [
  { category: 'POTHOLE', words: ['pothole', 'gaddha', 'crater', 'road hole', 'pot hole'] },
  { category: 'STREETLIGHT', words: ['streetlight', 'street light', 'lamp', 'light not working', 'dark street'] },
  { category: 'GARBAGE', words: ['garbage', 'trash', 'kachra', 'waste', 'dump', 'rubbish'] },
  { category: 'WATER_SUPPLY', words: ['water supply', 'no water', 'pipeline', 'tap', 'water leak'] },
  { category: 'SEWAGE', words: ['sewage', 'sewer', 'gutter overflow', 'manhole', 'drain overflow'] },
  { category: 'DRAINAGE', words: ['drainage', 'waterlogging', 'flood', 'clogged drain', 'water logged'] },
  { category: 'ROAD_DAMAGE', words: ['road damage', 'broken road', 'highway', 'collapsed road', 'cracked road'] },
  { category: 'TRAFFIC_SIGNAL', words: ['traffic signal', 'traffic light', 'signal not working', 'red light'] },
  { category: 'STRAY_ANIMALS', words: ['stray dog', 'stray cattle', 'stray animal', 'cattle', 'monkey menace'] },
  { category: 'ILLEGAL_CONSTRUCTION', words: ['illegal construction', 'encroachment', 'unauthorized building'] },
  { category: 'NOISE_POLLUTION', words: ['noise', 'loudspeaker', 'loud music', 'sound pollution'] },
  { category: 'TREE_FALL', words: ['tree fall', 'fallen tree', 'tree branch', 'uprooted tree'] },
  { category: 'ELECTRICITY', words: ['power cut', 'electricity', 'transformer', 'no power', 'voltage'] },
];

const SEVERITY_HINTS: Array<{ severity: Severity; words: string[] }> = [
  { severity: 'CRITICAL', words: ['accident', 'death', 'collapse', 'fire', 'electrocution', 'urgent', 'emergency', 'danger'] },
  { severity: 'HIGH', words: ['injury', 'major', 'overflow', 'flood', 'days', 'week', 'severe'] },
  { severity: 'LOW', words: ['minor', 'small', 'slight'] },
];

export function classifyWithFallback(text: string): ClassifierResult {
  const t = text.toLowerCase();
  let best: { category: Category; hits: number } = { category: 'OTHER', hits: 0 };
  for (const { category, words } of KEYWORDS) {
    const hits = words.reduce((n, w) => n + (t.includes(w) ? 1 : 0), 0);
    if (hits > best.hits) best = { category, hits };
  }

  let severity: Severity = 'MEDIUM';
  for (const { severity: s, words } of SEVERITY_HINTS) {
    if (words.some((w) => t.includes(w))) {
      severity = s;
      break;
    }
  }

  // Confidence scales with keyword evidence; OTHER is inherently low-confidence.
  const confidence = best.hits === 0 ? 0.2 : Math.min(0.5 + best.hits * 0.15, 0.85);
  return { category: best.category, severity, confidence, source: 'fallback' };
}

/**
 * Classify a complaint. Tries the LLM; on failure or low confidence, falls back
 * to deterministic keyword rules. Never throws — always returns a result.
 */
export async function classify(input: ClassifierInput): Promise<ClassifierResult> {
  const llm = await classifyWithLLM(input);
  if (llm && llm.confidence >= CONFIDENCE_THRESHOLD) return llm;

  const fallback = classifyWithFallback(input.text);
  // If the LLM produced a confident-enough answer it would have returned above;
  // otherwise prefer whichever has higher confidence.
  if (llm && llm.confidence >= fallback.confidence) return llm;
  return fallback;
}
