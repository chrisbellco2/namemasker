import type { Flag, PlaceholderType } from './types.js';

/**
 * Layer 1: deterministic regex. Emails, phones, ID/SSN patterns, dates,
 * street addresses. No ML. Near-perfect precision is the contract here;
 * anything fuzzy belongs in the contextual layer instead.
 */

interface DirectRule {
  category: string;
  placeholderType: PlaceholderType;
  reason: string;
  patterns: RegExp[];
}

// Order matters: earlier categories win when spans overlap.
const RULES: DirectRule[] = [
  {
    category: 'email',
    placeholderType: 'email',
    reason: 'Email address (deterministic pattern)',
    patterns: [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g],
  },
  {
    category: 'phone',
    placeholderType: 'phone',
    reason: 'Phone number (deterministic pattern)',
    patterns: [/(?:\+1[\s.-]?)?(?:\(\d{3}\)[\s.-]?|\b\d{3}[\s.-])\d{3}[\s.-]\d{4}\b/g],
  },
  {
    category: 'ssn',
    placeholderType: 'id',
    reason: 'SSN-format number (deterministic pattern)',
    patterns: [/\b\d{3}-\d{2}-\d{4}\b/g],
  },
  {
    category: 'id',
    placeholderType: 'id',
    reason: 'Labeled ID number (deterministic pattern)',
    patterns: [
      /\b(?:student\s+(?:id|number|no)|id(?:\s+(?:number|no))?|case\s+(?:number|no))\s*[#:.]?\s*\d{4,12}\b/gi,
    ],
  },
  {
    category: 'date',
    placeholderType: 'date',
    reason: 'Date (deterministic pattern)',
    patterns: [
      /\b\d{4}-\d{2}-\d{2}\b/g,
      /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}\b/gi,
      /\b\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\b/gi,
      /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g,
    ],
  },
  {
    category: 'address',
    placeholderType: 'address',
    reason: 'Street address (deterministic pattern)',
    patterns: [
      /\b\d{1,5}\s+(?:[A-Z][\w']+\s+){1,3}(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Court|Ct|Place|Pl|Way|Terrace|Ter|Circle|Cir)\b\.?/g,
    ],
  },
];

interface Span {
  start: number;
  end: number;
}

export function overlaps(a: Span, b: Span): boolean {
  return a.start < b.end && b.start < a.end;
}

function collect(re: RegExp, text: string): Array<{ start: number; end: number; text: string }> {
  const out: Array<{ start: number; end: number; text: string }> = [];
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out.push({ start: m.index, end: m.index + m[0].length, text: m[0] });
    if (m.index === re.lastIndex) re.lastIndex++;
  }
  return out;
}

/** Detect direct identifiers. Returned flags never overlap each other. */
export function detectDirect(text: string): Flag[] {
  const flags: Flag[] = [];
  for (const rule of RULES) {
    for (const pattern of rule.patterns) {
      for (const hit of collect(pattern, text)) {
        if (flags.some((f) => overlaps(f, hit))) continue;
        flags.push({
          kind: 'direct',
          category: rule.category,
          start: hit.start,
          end: hit.end,
          text: hit.text,
          reason: rule.reason,
          placeholderType: rule.placeholderType,
        });
      }
    }
  }
  return flags.sort((a, b) => a.start - b.start);
}
