import type { ContextSignal, Flag, PlaceholderType, ScanOptions } from './types';
import { DEFAULT_OPTIONS } from './types';

/**
 * Layer 3: contextual heuristics. Weighted rules produce signals; each signal
 * is scored as its own weight plus proximity-weighted contributions from
 * neighboring signals within ~200 chars. Signals crossing the threshold
 * (default 3) become yellow flags with a stated reason. Rules are tuned to
 * over-flag mildly: a false alarm costs a glance, a miss costs privacy.
 *
 * These flags are never auto-redacted. The professional decides.
 */

interface RuleDef {
  category: string;
  weight: number;
  reason: string;
  placeholderType: PlaceholderType;
  patterns: RegExp[];
}

const RULES: RuleDef[] = [
  {
    category: 'uniqueness-claim',
    weight: 2,
    reason: 'Uniqueness claim (first/only/sole + a role) can identify a student on its own',
    placeholderType: 'other',
    patterns: [
      /\b(?:first|only|sole)\b(?:\s+\w+){0,4}?\s+(?:captain|co-captain|president|chair|chairperson|founder|editor|student|member|winner|recipient|player|performer|graduate|girl|boy|woman|man|person)\b/gi,
    ],
  },
  {
    category: 'rare-role',
    weight: 3,
    reason: 'Rare role held by very few students in any school',
    placeholderType: 'other',
    patterns: [
      /\b(?:valedictorian|salutatorian|concertmaster|concertmistress|drum\s+major|student\s+body\s+president)\b/gi,
    ],
  },
  {
    category: 'award-reference',
    weight: 2,
    reason: 'Award reference narrows the field of possible students',
    placeholderType: 'other',
    patterns: [
      /\baward[\s-]winning\b/gi,
      /\b(?:won|received|earned)\s+(?:an?|the|several|multiple)\s+(?:\w+\s+){0,3}?awards?\b/gi,
      /\brecipient\s+of\b/gi,
    ],
  },
  {
    category: 'named-award',
    weight: 3,
    reason: 'Named award is searchable and may identify the student directly',
    placeholderType: 'other',
    patterns: [/\b(?:[A-Z][\w'&.]*\s+){1,4}(?:Award|Prize|Scholarship|Fellowship|Medal|Cup|Trophy)\b/g],
  },
  {
    category: 'rare-instrument',
    weight: 2,
    reason: 'Rare instrument or soloist role narrows the field sharply',
    placeholderType: 'other',
    patterns: [
      /\b(?:tuba|oboe|bassoon|harp|french\s+horn|euphonium|piccolo|marimba|harpsichord|bagpipes)(?:\s+soloist)?\b/gi,
      /\bsoloist\b/gi,
    ],
  },
  {
    category: 'named-ensemble',
    weight: 3,
    reason: 'Named ensemble ties the student to a specific school or region',
    placeholderType: 'org',
    patterns: [
      /\b(?:[A-Z][\w']+\s+){1,4}(?:Band|Orchestra|Choir|Chorale|Ensemble|Symphony|Philharmonic|Quartet|Quintet)\b/g,
    ],
  },
  {
    category: 'school-name',
    weight: 3,
    reason: 'School-name pattern (capitalized words + High/Prep/Academy)',
    placeholderType: 'school',
    patterns: [
      /\b(?:[A-Z][\w'.]+\s+){1,3}(?:High(?:\s+School)?|Prep(?:aratory)?(?:\s+School)?|Academy|Middle\s+School|Elementary(?:\s+School)?)\b/g,
    ],
  },
  {
    category: 'narrow-school-type',
    weight: 2,
    reason: 'Narrow school type sharply limits which schools this could be',
    placeholderType: 'other',
    patterns: [
      /\b(?:Quaker|Jesuit|Montessori|Waldorf|charter|boarding|magnet|parochial|all-girls|all-boys|single-sex)\s+(?:\w+\s+){0,2}?school\b/gi,
    ],
  },
  {
    category: 'school-size',
    weight: 1,
    reason: 'School-size mention narrows the school',
    placeholderType: 'other',
    patterns: [
      /\b(?:small|tiny|little)\s+(?:\w+\s+){0,2}?school\b/gi,
      /\bschool\s+of\s+(?:about\s+|around\s+|only\s+)?\d+\b/gi,
      /\bclass\s+of\s+(?:about\s+|around\s+|only\s+)?\d+\s+students\b/gi,
    ],
  },
  {
    category: 'geographic-narrowing',
    weight: 2,
    reason: 'Geographic narrowing (outside/near + a place) localizes the student',
    placeholderType: 'place',
    patterns: [
      /\b(?:just\s+outside|on\s+the\s+outskirts\s+of|outside|near)\s+(?:of\s+)?[A-Z][\w']+(?:\s+[A-Z][\w']+){0,2}/g,
    ],
  },
  {
    category: 'specific-achievement',
    weight: 2,
    reason: 'Specific achievement (state/national title) is searchable',
    placeholderType: 'other',
    patterns: [
      /\bstate\s+(?:\w+\s+){0,3}?(?:title|champion(?:ship)?s?|finalist)\b/gi,
      /\bnational\s+(?:\w+\s+){0,2}?(?:champion|title|finalist)\b/gi,
      /\ball-state\b/gi,
      /\ball-american\b/gi,
    ],
  },
  {
    category: 'uncommon-sport',
    weight: 2,
    reason: 'Less common sport narrows the field of students',
    placeholderType: 'other',
    patterns: [
      /\b(?:wrestling|fencing|alpine\s+skiing|nordic\s+skiing|water\s+polo|squash|rowing|crew\s+team|rugby|badminton|archery|equestrian|diving|sailing|curling|ultimate\s+frisbee|gymnastics)\b/gi,
    ],
  },
  {
    category: 'leadership-role',
    weight: 1,
    reason: 'Leadership role; identifying only when stacked with other signals',
    placeholderType: 'other',
    patterns: [
      /\b(?:captain|co-captain|president|vice\s+president|treasurer|secretary|editor-in-chief|section\s+leader|founder)\b/gi,
    ],
  },
  {
    category: 'anchoring-year',
    weight: 1,
    reason: 'Anchoring year; identifying only when stacked with other signals',
    placeholderType: 'other',
    patterns: [/\b(?:19|20)\d{2}\b/g, /\b(?:freshman|sophomore|junior|senior)\s+year\b/gi],
  },
];

const LIST_CONTINUATION: Omit<RuleDef, 'patterns'> = {
  category: 'school-list-continuation',
  weight: 2,
  reason: 'Listed alongside a detected school name; likely another school (list continuation)',
  placeholderType: 'school',
};

const REASON_BY_CATEGORY = new Map<string, string>([
  ...RULES.map((r) => [r.category, r.reason] as const),
  [LIST_CONTINUATION.category, LIST_CONTINUATION.reason],
]);

const PLACEHOLDER_BY_CATEGORY = new Map<string, PlaceholderType>([
  ...RULES.map((r) => [r.category, r.placeholderType] as const),
  [LIST_CONTINUATION.category, LIST_CONTINUATION.placeholderType],
]);

interface Span {
  start: number;
  end: number;
  text: string;
}

function collect(re: RegExp, text: string): Span[] {
  const out: Span[] = [];
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out.push({ start: m.index, end: m.index + m[0].length, text: m[0] });
    if (m.index === re.lastIndex) re.lastIndex++;
  }
  return out;
}

function spansOverlap(a: { start: number; end: number }, b: { start: number; end: number }): boolean {
  return a.start < b.end && b.start < a.end;
}

/**
 * The Fairview rule: after a school-name match, capitalized tokens that
 * continue the same comma/and list are probable schools too. The chain breaks
 * at the first lowercase word, so it cannot wander into unrelated text.
 */
function findListContinuations(text: string, schoolSpans: Span[]): Span[] {
  const out: Span[] = [];
  const CHAIN = /^(?:\s*,\s*(?:and\s+|or\s+)?|\s+(?:and|or)\s+)([A-Z][\w']+(?:\s+[A-Z][\w']+)?)/;
  for (const school of schoolSpans) {
    let pos = school.end;
    for (;;) {
      const m = CHAIN.exec(text.slice(pos));
      if (m === null || m[1] === undefined) break;
      const start = pos + m[0].length - m[1].length;
      const span = { start, end: start + m[1].length, text: m[1] };
      pos = span.end;
      // Skip anything the school-name rule already caught.
      if (!schoolSpans.some((s) => spansOverlap(s, span))) out.push(span);
    }
  }
  return out;
}

/** Gather raw rule hits, deduplicating overlapping hits of the same category. */
export function collectSignals(text: string): ContextSignal[] {
  const signals: ContextSignal[] = [];
  const push = (category: string, weight: number, span: Span): void => {
    if (signals.some((s) => s.category === category && spansOverlap(s, span))) return;
    signals.push({ category, weight, start: span.start, end: span.end, text: span.text });
  };

  let schoolSpans: Span[] = [];
  for (const rule of RULES) {
    const spans = rule.patterns.flatMap((p) => collect(p, text));
    if (rule.category === 'school-name') schoolSpans = spans;
    for (const span of spans) push(rule.category, rule.weight, span);
  }
  for (const span of findListContinuations(text, schoolSpans)) {
    push(LIST_CONTINUATION.category, LIST_CONTINUATION.weight, span);
  }
  return signals.sort((a, b) => a.start - b.start);
}

function gap(a: ContextSignal, b: ContextSignal): number {
  if (spansOverlap(a, b)) return 0;
  return a.start >= b.end ? a.start - b.end : b.start - a.end;
}

export interface ContextualResult {
  /** All raw signals, including those below the flag threshold. */
  signals: ContextSignal[];
  flags: Flag[];
}

/** Score signals against their neighbors and return flags for those crossing the threshold. */
export function detectContextual(text: string, options: ScanOptions = {}): ContextualResult {
  const { flagThreshold, proximityWindow } = { ...DEFAULT_OPTIONS, ...options };
  const signals = collectSignals(text);
  const flags: Flag[] = [];

  for (const signal of signals) {
    let score = signal.weight;
    const supporters: string[] = [];
    for (const other of signals) {
      if (other === signal) continue;
      const d = gap(signal, other);
      if (d > proximityWindow) continue;
      score += other.weight * (1 - d / proximityWindow);
      supporters.push(other.category);
    }
    if (score < flagThreshold) continue;
    const support =
      supporters.length > 0
        ? `; stacked with ${supporters.length} nearby signal${supporters.length === 1 ? '' : 's'}`
        : '';
    flags.push({
      kind: 'contextual',
      category: signal.category,
      start: signal.start,
      end: signal.end,
      text: signal.text,
      reason: `${REASON_BY_CATEGORY.get(signal.category) ?? signal.category} (score ${score.toFixed(1)}, threshold ${flagThreshold}${support})`,
      placeholderType: PLACEHOLDER_BY_CATEGORY.get(signal.category) ?? 'other',
      score,
    });
  }
  return { signals, flags };
}
