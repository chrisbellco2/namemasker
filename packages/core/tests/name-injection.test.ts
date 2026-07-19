import { describe, expect, it } from 'vitest';
import { scanDocument, type Flag } from '../src/index';
import { MAYA_LETTER } from './corpus';

/**
 * Phase 3 contract: an external name detector (the on-device NER model in
 * the site) supplies name flags via options.nameFlags, replacing the naive
 * capitalized-pair layer. Corpus case: bare "Maya" — the known naive-layer
 * miss that NER exists to fix.
 */

function nerFlag(text: string, start: number, category: string): Flag {
  return {
    kind: 'name',
    category,
    start,
    end: start + text.length,
    text,
    reason: 'Tagged by the on-device model',
    placeholderType: category === 'ner-per' ? 'student' : 'other',
  };
}

describe('scanDocument with injected name flags', () => {
  it('uses injected flags instead of the naive layer', () => {
    const bare = MAYA_LETTER.indexOf('Maya became');
    const nameFlags = [
      nerFlag('Maya Chen', MAYA_LETTER.indexOf('Maya Chen'), 'ner-per'),
      nerFlag('Maya', bare, 'ner-per'),
    ];
    const result = scanDocument(MAYA_LETTER, { nameFlags });
    const names = result.flags.filter((f) => f.kind === 'name');
    expect(names.map((n) => n.text)).toEqual(['Maya Chen', 'Maya']);
    expect(names.every((n) => n.category === 'ner-per')).toBe(true);
  });

  it('catches the bare "Maya" the naive layer misses', () => {
    const naive = scanDocument(MAYA_LETTER);
    const bareStart = MAYA_LETTER.indexOf('Maya became');
    expect(naive.flags.some((f) => f.kind === 'name' && f.start === bareStart)).toBe(false);

    const withNer = scanDocument(MAYA_LETTER, {
      nameFlags: [nerFlag('Maya', bareStart, 'ner-per')],
    });
    expect(withNer.flags.some((f) => f.kind === 'name' && f.start === bareStart)).toBe(true);
  });

  it('still drops injected names that overlap direct identifiers', () => {
    const emailStart = MAYA_LETTER.indexOf('j.rivera@');
    const result = scanDocument(MAYA_LETTER, {
      nameFlags: [nerFlag('j.rivera', emailStart, 'ner-per')],
    });
    expect(result.flags.filter((f) => f.kind === 'name')).toHaveLength(0);
  });

  it('an empty injected list means no name flags, not a fallback to naive', () => {
    const result = scanDocument(MAYA_LETTER, { nameFlags: [] });
    expect(result.flags.filter((f) => f.kind === 'name')).toHaveLength(0);
  });
});
