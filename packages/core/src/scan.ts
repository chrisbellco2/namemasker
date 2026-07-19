import type { Flag, ScanOptions, ScanResult } from './types';
import { DEFAULT_OPTIONS } from './types';
import { detectDirect, overlaps } from './direct';
import { detectNamesNaive } from './names';
import { detectContextual } from './contextual';

/**
 * Run all detection layers over a document and apply layer 4: document-level
 * accumulation. The banner is a flag for the professional, never a redaction,
 * and no result from this function ever means "this document is safe."
 */
export function scanDocument(text: string, options: ScanOptions = {}): ScanResult {
  const { accumulationThreshold } = { ...DEFAULT_OPTIONS, ...options };

  const direct = detectDirect(text);
  // Direct hits win over the name layer and over contextual signals that
  // fall entirely inside them (e.g. a year inside a full date).
  const names = (options.nameFlags ?? detectNamesNaive(text)).filter(
    (n) => !direct.some((d) => overlaps(d, n)),
  );
  const contextual = detectContextual(text, options).flags.filter(
    (c) => !direct.some((d) => d.start <= c.start && c.end <= d.end),
  );

  const flags: Flag[] = [...direct, ...names, ...contextual].sort(
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
