import { describe, expect, it } from 'vitest';
import { maskText, nextPlaceholder, parseMapping, serializeMapping, unmaskText } from '../src/index';

describe('placeholder sequences', () => {
  it('students get letters, others get numbers', () => {
    expect(nextPlaceholder('student', {})).toBe('Student A');
    expect(nextPlaceholder('school', {})).toBe('School 1');
    expect(nextPlaceholder('student', { 'Maya Chen': 'Student A' })).toBe('Student B');
    expect(nextPlaceholder('school', { 'Lakeside Prep': 'School 1' })).toBe('School 2');
  });

  it('letters continue past Z', () => {
    const mapping: Record<string, string> = {};
    for (let i = 0; i < 26; i++) mapping[`name-${i}`] = nextPlaceholder('student', mapping);
    expect(nextPlaceholder('student', mapping)).toBe('Student AA');
  });
});

describe('maskText', () => {
  it('assigns placeholders in detection order per type', () => {
    const { masked, mapping } = maskText(
      'Maya Chen and Jenny Smith both attend Lakeside Prep.',
      [
        { text: 'Jenny Smith', placeholderType: 'student' },
        { text: 'Maya Chen', placeholderType: 'student' },
        { text: 'Lakeside Prep', placeholderType: 'school' },
      ],
    );
    expect(mapping).toEqual({
      'Maya Chen': 'Student A',
      'Jenny Smith': 'Student B',
      'Lakeside Prep': 'School 1',
    });
    expect(masked).toBe('Student A and Student B both attend School 1.');
  });

  it('applies a loaded mapping first, beating model misses', () => {
    const { masked, mapping } = maskText(
      'Maya Chen met Jenny Smith after class.',
      [{ text: 'Jenny Smith', placeholderType: 'student' }],
      { 'Maya Chen': 'Student A' },
    );
    expect(mapping['Jenny Smith']).toBe('Student B');
    expect(masked).toBe('Student A met Student B after class.');
  });

  it('replaces every exact occurrence, not just the detected one', () => {
    const { masked } = maskText('Maya Chen is bright. Maya Chen works hard.', [
      { text: 'Maya Chen', placeholderType: 'student' },
    ]);
    expect(masked).toBe('Student A is bright. Student A works hard.');
  });

  it('does not replace inside larger words', () => {
    const { masked } = maskText('Maya visited the Mayan exhibit.', [{ text: 'Maya', placeholderType: 'student' }]);
    expect(masked).toBe('Student A visited the Mayan exhibit.');
  });

  it('handles overlapping reals, longest first', () => {
    const { masked } = maskText(
      'Maya Chen said Chen is a common name.',
      [
        { text: 'Maya Chen', placeholderType: 'student' },
        { text: 'Chen', placeholderType: 'student' },
      ],
    );
    expect(masked).toBe('Student A said Student B is a common name.');
  });
});

describe('unmaskText', () => {
  it('round-trips a masked document', () => {
    const original = 'Maya Chen attends Lakeside Prep. Email her at maya@example.org.';
    const { masked, mapping } = maskText(original, [
      { text: 'Maya Chen', placeholderType: 'student' },
      { text: 'Lakeside Prep', placeholderType: 'school' },
      { text: 'maya@example.org', placeholderType: 'email' },
    ]);
    expect(masked).not.toContain('Maya');
    expect(unmaskText(masked, mapping)).toBe(original);
  });

  it('restores placeholders the AI kept, anywhere in new text', () => {
    const mapping = { 'Maya Chen': 'Student A' };
    expect(unmaskText('In summary, Student A shows unusual promise.', mapping)).toBe(
      'In summary, Maya Chen shows unusual promise.',
    );
  });

  it('does not confuse Student A with Student AA', () => {
    const mapping = { 'Maya Chen': 'Student A', 'Aria Long': 'Student AA' };
    expect(unmaskText('Student AA and Student A met.', mapping)).toBe('Aria Long and Maya Chen met.');
  });
});

describe('mapping import/export', () => {
  it('round-trips through serialize and parse', () => {
    const mapping = { 'Maya Chen': 'Student A', 'Lakeside Prep': 'School 1' };
    expect(parseMapping(serializeMapping(mapping))).toEqual(mapping);
  });

  it('rejects non-object JSON', () => {
    expect(() => parseMapping('["Student A"]')).toThrow();
    expect(() => parseMapping('not json')).toThrow();
  });

  it('rejects non-string or empty values', () => {
    expect(() => parseMapping('{"Maya Chen": 3}')).toThrow();
    expect(() => parseMapping('{"Maya Chen": ""}')).toThrow();
  });

  it('rejects duplicate placeholders that would make Unmask ambiguous', () => {
    expect(() => parseMapping('{"Maya Chen": "Student A", "Jenny Smith": "Student A"}')).toThrow(/ambiguous/);
  });
});
