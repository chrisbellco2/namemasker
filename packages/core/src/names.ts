import type { Flag } from './types.js';

/**
 * Layer 2, Phase 2 form: a deliberately naive capitalized-pair pattern.
 * This is a stopgap with known false positives and misses; Phase 3 replaces
 * it with a small on-device NER model. The reason string on every flag says
 * so, honestly, and the UI surfaces that reason.
 */

const NAIVE_REASON =
  'Looks like a personal name: two capitalized words (naive pattern; an on-device model replaces this in a later phase)';

// Second words that indicate an institution or thing, not a person.
// Schools and ensembles are handled by the contextual layer instead.
const SECOND_WORD_STOPLIST = new Set([
  'High', 'Prep', 'Academy', 'Preparatory', 'School', 'Elementary', 'Middle',
  'Band', 'Orchestra', 'Choir', 'Chorale', 'Ensemble', 'Symphony', 'Philharmonic',
  'Honors', 'University', 'College', 'Institute', 'Award', 'Prize', 'Scholarship',
  'Fellowship', 'Medal', 'Committee', 'Department', 'Office', 'Center', 'Foundation',
  'Association', 'Club', 'Team', 'League', 'County', 'City', 'State', 'Hall',
  'Park', 'Library', 'Hospital', 'Church', 'Program', 'Project', 'Street',
  'Avenue', 'Road', 'Boulevard', 'Lane', 'Drive', 'Court',
]);

// Common sentence-openers and function words that begin false pairs.
const FIRST_WORD_STOPLIST = new Set([
  'The', 'A', 'An', 'As', 'At', 'In', 'On', 'Of', 'My', 'Our', 'Your', 'His',
  'Her', 'Their', 'This', 'That', 'These', 'Those', 'Dear', 'If', 'When',
  'While', 'After', 'Before', 'She', 'He', 'They', 'It', 'We', 'You', 'But',
  'And', 'Or', 'So', 'To', 'For', 'From', 'With', 'By', 'Please',
]);

const PAIR = /\b([A-Z][a-z]+)\s+(?:[A-Z]\.\s+)?([A-Z][a-z]+)\b/g;

/** Detect probable personal names with the naive capitalized-pair pattern. */
export function detectNamesNaive(text: string): Flag[] {
  const flags: Flag[] = [];
  PAIR.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PAIR.exec(text)) !== null) {
    const [whole, first, second] = m;
    if (first === undefined || second === undefined) continue;
    if (FIRST_WORD_STOPLIST.has(first) || SECOND_WORD_STOPLIST.has(second)) {
      // Rescan from the second word so "The Maya Chen" still finds "Maya Chen".
      PAIR.lastIndex = m.index + first.length;
      continue;
    }
    flags.push({
      kind: 'name',
      category: 'name-pair',
      start: m.index,
      end: m.index + whole.length,
      text: whole,
      reason: NAIVE_REASON,
      placeholderType: 'student',
    });
  }
  return flags;
}
