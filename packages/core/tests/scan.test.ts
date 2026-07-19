import { describe, expect, it } from 'vitest';
import { scanDocument } from '../src/index';
import { JENNY_DOC, MAYA_LETTER, NEGATIVE_CASES } from './corpus';

describe('corpus: Maya (rec letter)', () => {
  const result = scanDocument(MAYA_LETTER);
  const { flags } = result;

  it('finds the email', () => {
    expect(flags.some((f) => f.category === 'email' && f.text === 'j.rivera@lakesideprep.org')).toBe(true);
  });

  it('finds the phone number', () => {
    expect(flags.some((f) => f.category === 'phone' && f.text.includes('555-0148'))).toBe(true);
  });

  it('finds Maya Chen as a name', () => {
    expect(flags.some((f) => f.kind === 'name' && f.text === 'Maya Chen')).toBe(true);
  });

  it('flags Lakeside Prep as a school', () => {
    expect(flags.some((f) => f.category === 'school-name' && f.text === 'Lakeside Prep')).toBe(true);
  });

  it('yields stacked contextual flags on the Quaker-school sentence', () => {
    const start = MAYA_LETTER.indexOf('Maya became');
    const end = MAYA_LETTER.indexOf('humility');
    const inSentence = flags.filter((f) => f.kind === 'contextual' && f.start >= start && f.end <= end);
    expect(inSentence.length).toBeGreaterThanOrEqual(3);
    const cats = inSentence.map((f) => f.category);
    expect(cats).toContain('uniqueness-claim');
    expect(cats).toContain('narrow-school-type');
    expect(cats).toContain('geographic-narrowing');
    expect(cats).toContain('uncommon-sport');
  });

  it('every flag states a reason', () => {
    for (const f of flags) expect(f.reason.length).toBeGreaterThan(0);
  });
});

describe('corpus: Jenny (the founding miss)', () => {
  const result = scanDocument(JENNY_DOC);
  const { flags } = result;
  const contextual = flags.filter((f) => f.kind === 'contextual');

  it('flags the ensemble', () => {
    expect(contextual.some((f) => f.category === 'named-ensemble' && f.text === 'Colorado Honors Band')).toBe(true);
  });

  it('flags the suffixed schools', () => {
    const schools = contextual.filter((f) => f.category === 'school-name').map((f) => f.text);
    expect(schools).toContain('Boulder High');
    expect(schools).toContain('South High');
  });

  it('flags Fairview via list continuation', () => {
    expect(contextual.some((f) => f.category === 'school-list-continuation' && f.text === 'Fairview')).toBe(true);
  });

  it('flags the award reference', () => {
    expect(contextual.some((f) => f.category === 'award-reference')).toBe(true);
  });

  it('flags the instrument', () => {
    expect(contextual.some((f) => f.category === 'rare-instrument' && /tuba/.test(f.text))).toBe(true);
  });

  it('stacks the sport and captain signals into flags', () => {
    expect(contextual.some((f) => f.category === 'uncommon-sport' && f.text === 'alpine skiing')).toBe(true);
    expect(contextual.some((f) => f.category === 'leadership-role' && f.text === 'captain')).toBe(true);
  });

  it('finds Jenny Smith as a name', () => {
    expect(flags.some((f) => f.kind === 'name' && f.text === 'Jenny Smith')).toBe(true);
  });

  it('fires the document-level accumulation banner', () => {
    expect(result.accumulation.triggered).toBe(true);
    expect(result.accumulation.contextualCount).toBeGreaterThanOrEqual(6);
    expect(result.accumulation.message).toMatch(/may still identify/);
  });
});

describe('corpus: negative cases (false-positive restraint)', () => {
  for (const [label, text] of Object.entries(NEGATIVE_CASES)) {
    it(`${label} produces zero flags`, () => {
      const result = scanDocument(text);
      expect(result.flags).toHaveLength(0);
      expect(result.accumulation.triggered).toBe(false);
    });
  }
});

describe('layer composition', () => {
  it('drops contextual signals that sit inside a direct flag', () => {
    const result = scanDocument('Her birthday is March 3, 2024, a fact she mentions.');
    expect(result.flags.filter((f) => f.kind === 'direct' && f.category === 'date')).toHaveLength(1);
    expect(result.flags.filter((f) => f.category === 'anchoring-year')).toHaveLength(0);
  });

  it('never claims safety: an empty result is just an empty result', () => {
    const result = scanDocument(NEGATIVE_CASES['a generic sentence']!);
    expect(result.flags).toEqual([]);
    expect(Object.keys(result.accumulation)).not.toContain('safe');
  });
});
