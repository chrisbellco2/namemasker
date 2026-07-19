import type { ApprovedItem, Mapping, PlaceholderType } from './types';

/**
 * Mapping and restore. The mapping is a flat JSON object, real string ->
 * placeholder. It is the only sensitive artifact the tool creates, it makes
 * Unmask possible, and it never leaves the user's device.
 */

const TYPE_LABEL: Record<PlaceholderType, string> = {
  student: 'Student',
  parent: 'Parent',
  school: 'School',
  coach: 'Coach',
  org: 'Organization',
  place: 'Place',
  email: 'Email',
  phone: 'Phone',
  id: 'ID',
  date: 'Date',
  address: 'Address',
  other: 'Detail',
};

/** 0 -> A, 25 -> Z, 26 -> AA (bijective base 26). Students get letters. */
function indexToLetters(index: number): string {
  let n = index + 1;
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** Next unused placeholder in the sequence for a type: Student A/B, School 1/2, ... */
export function nextPlaceholder(type: PlaceholderType, mapping: Mapping): string {
  const label = TYPE_LABEL[type];
  const used = new Set(Object.values(mapping));
  for (let i = 0; ; i++) {
    const candidate = type === 'student' ? `${label} ${indexToLetters(i)}` : `${label} ${i + 1}`;
    if (!used.has(candidate)) return candidate;
  }
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Build one alternation regex for exact, whole-token replacement. Longest first. */
function buildPattern(keys: string[]): RegExp {
  const sorted = [...keys].sort((a, b) => b.length - a.length).map(escapeRegExp);
  return new RegExp(`(?<!\\w)(?:${sorted.join('|')})(?!\\w)`, 'g');
}

export interface MaskResult {
  masked: string;
  mapping: Mapping;
}

/**
 * Mask a document. Pass order per spec: exact-match replacement from the
 * loaded mapping first (a loaded mapping beats model misses), then approved
 * new detections get the next placeholder in their type's sequence, assigned
 * in detection order (position in the document).
 */
export function maskText(text: string, approved: ApprovedItem[], existing: Mapping = {}): MaskResult {
  const mapping: Mapping = { ...existing };

  const inOrder = [...approved].sort((a, b) => text.indexOf(a.text) - text.indexOf(b.text));
  for (const item of inOrder) {
    if (item.text.length === 0 || mapping[item.text] !== undefined) continue;
    mapping[item.text] = nextPlaceholder(item.placeholderType, mapping);
  }

  const keys = Object.keys(mapping);
  if (keys.length === 0) return { masked: text, mapping };
  const masked = text.replace(buildPattern(keys), (m) => mapping[m] ?? m);
  return { masked, mapping };
}

/** Unmask: the mapping applied in reverse. Pure substitution, nothing else. */
export function unmaskText(text: string, mapping: Mapping): string {
  const byPlaceholder = new Map<string, string>();
  for (const [real, placeholder] of Object.entries(mapping)) {
    byPlaceholder.set(placeholder, real);
  }
  if (byPlaceholder.size === 0) return text;
  const pattern = buildPattern([...byPlaceholder.keys()]);
  return text.replace(pattern, (m) => byPlaceholder.get(m) ?? m);
}

/** Serialize for export as {student}.map.json. */
export function serializeMapping(mapping: Mapping): string {
  return `${JSON.stringify(mapping, null, 2)}\n`;
}

/** Parse an imported mapping file, validating shape and placeholder uniqueness. */
export function parseMapping(json: string): Mapping {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('Mapping file is not valid JSON.');
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Mapping file must be a JSON object of real string -> placeholder.');
  }
  const entries = Object.entries(parsed as Record<string, unknown>);
  const seen = new Set<string>();
  for (const [real, placeholder] of entries) {
    if (typeof placeholder !== 'string' || placeholder.length === 0 || real.length === 0) {
      throw new Error('Mapping file must map non-empty strings to non-empty strings.');
    }
    if (seen.has(placeholder)) {
      throw new Error(`Mapping file reuses the placeholder "${placeholder}"; Unmask would be ambiguous.`);
    }
    seen.add(placeholder);
  }
  return parsed as Mapping;
}
