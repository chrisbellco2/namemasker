import { describe, expect, it } from 'vitest';
import {
  addToMap,
  applyMap,
  createStudentMap,
  liftV1,
  parseStudentMap,
  scanDocument,
  serializeStudentMap,
  unmaskText,
  type StudentMap,
} from '../src/index';

describe('map format v2: parse and serialize', () => {
  const map: StudentMap = {
    mapping: { 'Maya Chen': 'Student A', 'Lakeside Prep': 'School 1' },
    aliases: { Maya: 'Student A' },
    watchlist: ['Xiulan', 'Brown'],
  };

  it('round-trips through serialize and parse', () => {
    expect(parseStudentMap(serializeStudentMap(map))).toEqual(map);
  });

  it('lifts a v1 flat file, forever', () => {
    const v1 = '{"Maya Chen": "Student A", "Lakeside Prep": "School 1"}';
    expect(parseStudentMap(v1)).toEqual({
      mapping: { 'Maya Chen': 'Student A', 'Lakeside Prep': 'School 1' },
      aliases: {},
      watchlist: [],
    });
  });

  it('rejects duplicate placeholders in mapping', () => {
    expect(() =>
      parseStudentMap('{"format":"namemasker-map@2","mapping":{"A":"Student A","B":"Student A"}}'),
    ).toThrow(/ambiguous/);
  });

  it('rejects aliases pointing at unknown placeholders', () => {
    expect(() =>
      parseStudentMap('{"format":"namemasker-map@2","mapping":{},"aliases":{"Maya":"Student A"}}'),
    ).toThrow(/not in the mapping/);
  });

  it('rejects unknown formats honestly', () => {
    expect(() => parseStudentMap('{"format":"namemasker-map@3"}')).toThrow(/Unrecognized/);
  });
});

describe('aliases: mask both, restore canonical', () => {
  it('bare first name joins the canonical placeholder', () => {
    const map = createStudentMap();
    addToMap(map, { text: 'Maya Chen', placeholderType: 'student' });
    const ph = addToMap(map, { text: 'Maya', placeholderType: 'student' });
    expect(ph).toBe('Student A');
    expect(map.aliases['Maya']).toBe('Student A');
    expect(map.mapping['Maya']).toBeUndefined();
  });

  it('masks canonical and alias, unmasks to canonical only', () => {
    const map = createStudentMap();
    addToMap(map, { text: 'Maya Chen', placeholderType: 'student' });
    addToMap(map, { text: 'Maya', placeholderType: 'student' });
    const masked = applyMap('Maya Chen is bright. Maya works hard.', map);
    expect(masked).toBe('Student A is bright. Student A works hard.');
    expect(unmaskText('In short, Student A excels.', map.mapping)).toBe('In short, Maya Chen excels.');
  });

  it('unrelated people still get their own placeholder', () => {
    const map = createStudentMap();
    addToMap(map, { text: 'Maya Chen', placeholderType: 'student' });
    expect(addToMap(map, { text: 'Jenny Smith', placeholderType: 'student' })).toBe('Student B');
  });

  it('per-document exclusion masks everything except the dismissed term', () => {
    const map = liftV1({ 'Maya Chen': 'Student A', Brown: 'School 1' });
    const masked = applyMap('Maya Chen applied to Brown University.', map, new Set(['Brown']));
    expect(masked).toBe('Student A applied to Brown University.');
  });
});

describe('knownTerms: caller-supplied truth', () => {
  it('stages every whole-token occurrence with the stated reason', () => {
    const result = scanDocument('Xiulan wrote well. We admire Xiulan.', {
      knownTerms: [{ term: 'Xiulan' }],
    });
    const known = result.flags.filter((f) => f.category === 'known-term');
    expect(known).toHaveLength(2);
    expect(known[0]!.reason).toMatch(/always-flag/);
  });

  it('does not fire inside larger words', () => {
    const result = scanDocument('The Annex is closed.', { knownTerms: [{ term: 'Ann' }] });
    expect(result.flags.filter((f) => f.category === 'known-term')).toHaveLength(0);
  });

  it('wins overlaps with the name layer', () => {
    const result = scanDocument('I recommend Maya Chen.', { knownTerms: [{ term: 'Maya Chen' }] });
    const names = result.flags.filter((f) => f.kind === 'name');
    expect(names).toHaveLength(1);
    expect(names[0]!.category).toBe('known-term');
  });
});
