import type { ApprovedItem, Mapping, PlaceholderType, StudentMap } from './types';

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

// ---------- map format v2 ----------

export const MAP_FORMAT = 'namemasker-map@2';

export function createStudentMap(): StudentMap {
  return { mapping: {}, aliases: {}, watchlist: [] };
}

/** Lift a v1 flat mapping into the v2 shape. v1 files import forever. */
export function liftV1(mapping: Mapping): StudentMap {
  return { mapping: { ...mapping }, aliases: {}, watchlist: [] };
}

/**
 * Add an approved item to the map. If the item is a person whose text is a
 * word of an already-mapped person (bare "Maya" after "Maya Chen"), it
 * becomes an alias of that placeholder instead of getting its own.
 * Mutates the map; returns the placeholder used.
 */
export function addToMap(map: StudentMap, item: ApprovedItem): string {
  const existing = map.mapping[item.text] ?? map.aliases[item.text];
  if (existing !== undefined) return existing;
  if (item.placeholderType === 'student') {
    for (const [real, placeholder] of Object.entries(map.mapping)) {
      if (placeholder.startsWith('Student ') && real.split(/\s+/).includes(item.text)) {
        map.aliases[item.text] = placeholder;
        return placeholder;
      }
    }
  }
  const placeholder = nextPlaceholder(item.placeholderType, map.mapping);
  map.mapping[item.text] = placeholder;
  return placeholder;
}

/**
 * Apply the map to a document: canonical reals and aliases both mask to
 * their placeholder. `exclude` skips specific reals for this document only
 * (a dismissed watchlist hit) without touching the map.
 */
export function applyMap(text: string, map: StudentMap, exclude?: ReadonlySet<string>): string {
  const pairs: Mapping = {};
  for (const [real, ph] of Object.entries(map.mapping)) {
    if (!exclude?.has(real)) pairs[real] = ph;
  }
  for (const [real, ph] of Object.entries(map.aliases)) {
    if (!exclude?.has(real)) pairs[real] = ph;
  }
  const keys = Object.keys(pairs);
  if (keys.length === 0) return text;
  return text.replace(buildPattern(keys), (m) => pairs[m] ?? m);
}

/** Serialize the full v2 map for export as {student}.map.json. */
export function serializeStudentMap(map: StudentMap): string {
  return `${JSON.stringify(
    { format: MAP_FORMAT, mapping: map.mapping, aliases: map.aliases, watchlist: map.watchlist },
    null,
    2,
  )}\n`;
}

function validateEntries(obj: Record<string, unknown>, what: string): asserts obj is Mapping {
  for (const [real, ph] of Object.entries(obj)) {
    if (typeof ph !== 'string' || ph.length === 0 || real.length === 0) {
      throw new Error(`Map file ${what} must map non-empty strings to non-empty strings.`);
    }
  }
}

/** Parse an imported map file: v2, or a v1 flat mapping (lifted). */
export function parseStudentMap(json: string): StudentMap {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('Map file is not valid JSON.');
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Map file must be a JSON object.');
  }
  const obj = parsed as Record<string, unknown>;

  if (obj['format'] === undefined) {
    // v1: flat real -> placeholder
    return liftV1(parseMapping(json));
  }
  if (obj['format'] !== MAP_FORMAT) {
    throw new Error(`Unrecognized map format "${String(obj['format'])}".`);
  }
  const mapping = (obj['mapping'] ?? {}) as Record<string, unknown>;
  const aliases = (obj['aliases'] ?? {}) as Record<string, unknown>;
  const watchlist = obj['watchlist'] ?? [];
  if (typeof mapping !== 'object' || mapping === null || Array.isArray(mapping)) {
    throw new Error('Map file "mapping" must be an object.');
  }
  if (typeof aliases !== 'object' || aliases === null || Array.isArray(aliases)) {
    throw new Error('Map file "aliases" must be an object.');
  }
  if (!Array.isArray(watchlist) || watchlist.some((w) => typeof w !== 'string' || w.length === 0)) {
    throw new Error('Map file "watchlist" must be an array of non-empty strings.');
  }
  validateEntries(mapping, '"mapping"');
  validateEntries(aliases, '"aliases"');
  const seen = new Set<string>();
  for (const ph of Object.values(mapping)) {
    if (seen.has(ph)) throw new Error(`Map file reuses the placeholder "${ph}"; Unmask would be ambiguous.`);
    seen.add(ph);
  }
  for (const [real, ph] of Object.entries(aliases)) {
    if (!seen.has(ph)) {
      throw new Error(`Alias "${real}" points at "${ph}", which is not in the mapping.`);
    }
  }
  return { mapping, aliases, watchlist: [...new Set(watchlist as string[])] };
}

/** Serialize for export as {student}.map.json. (v1 shape; superseded by serializeStudentMap.) */
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
