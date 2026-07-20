import type { Flag, KnownTerm, ScanOptions, ScanResult } from './types.js';
import { DEFAULT_OPTIONS } from './types.js';
import { detectDirect, overlaps } from './direct.js';
import { detectNamesNaive } from './names.js';
import { detectContextual } from './contextual.js';

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Stage every whole-token occurrence of the caller's known terms. */
export function detectKnownTerms(text: string, terms: KnownTerm[]): Flag[] {
  const flags: Flag[] = [];
  for (const t of terms) {
    if (t.term.trim().length === 0) continue;
    const re = new RegExp(`(?<!\\w)${escapeRegExp(t.term)}(?!\\w)`, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      flags.push({
        kind: 'name',
        category: 'known-term',
        start: m.index,
        end: m.index + m[0].length,
        text: m[0],
        reason: t.label ?? 'On your always-flag list',
        placeholderType: t.placeholderType ?? 'student',
      });
      if (m.index === re.lastIndex) re.lastIndex++;
    }
  }
  return flags;
}

/**
 * Run all detection layers over a document and apply layer 4: document-level
 * accumulation. The banner is a flag for the professional, never a redaction,
 * and no result from this function ever means "this document is safe."
 */
export function scanDocument(text: string, options: ScanOptions = {}): ScanResult {
  const { accumulationThreshold } = { ...DEFAULT_OPTIONS, ...options };

  // Known terms are caller-supplied truth; they win every overlap.
  const known = detectKnownTerms(text, options.knownTerms ?? []);
  const direct = detectDirect(text).filter((d) => !known.some((k) => overlaps(k, d)));
  // Direct hits win over the name layer and over contextual signals that
  // fall entirely inside them (e.g. a year inside a full date).
  const names = (options.nameFlags ?? detectNamesNaive(text)).filter(
    (n) => !direct.some((d) => overlaps(d, n)) && !known.some((k) => overlaps(k, n)),
  );
  const contextual = detectContextual(text, options).flags.filter(
    (c) =>
      !direct.some((d) => d.start <= c.start && c.end <= d.end) &&
      !known.some((k) => k.start <= c.start && c.end <= k.end),
  );

  const flags: Flag[] = [...known, ...direct, ...names, ...contextual].sort(
    (a, b) => a.start - b.start || a.end - b.end,
  );

  const contextualCount = contextual.length;
  const triggered = contextualCount >= accumulationThreshold;
  return {
    flags,
    accumulation: {
      triggered,
      contextualCount,
      ...(triggered
        ? {
            message: `${contextualCount} contextual details flagged in this document. Even with each one masked, the combination may still identify the student. Review whether the pieces together narrow to one person.`,
          }
        : {}),
    },
  };
}
