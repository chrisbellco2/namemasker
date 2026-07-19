import { describe, expect, it } from 'vitest';
import { detectDirect } from '../src/index';

const categories = (text: string) => detectDirect(text).map((f) => f.category);

describe('direct layer: emails', () => {
  it('detects a plain email', () => {
    const flags = detectDirect('Reach me at j.rivera@lakesideprep.org today.');
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({ kind: 'direct', category: 'email', text: 'j.rivera@lakesideprep.org', placeholderType: 'email' });
  });
});

describe('direct layer: phones', () => {
  it.each([
    '(215) 555-0148',
    '215-555-0148',
    '215.555.0148',
    '+1 215 555 0148',
  ])('detects %s', (phone) => {
    const flags = detectDirect(`Call ${phone} anytime.`);
    expect(flags.some((f) => f.category === 'phone' && f.text.includes('555'))).toBe(true);
  });
});

describe('direct layer: IDs', () => {
  it('detects an SSN-format number', () => {
    expect(categories('SSN 123-45-6789 on file.')).toContain('ssn');
  });
  it('detects a labeled ID', () => {
    expect(categories('Student ID: 20231234 was assigned.')).toContain('id');
  });
  it('detects a transcript-style student number (corpus: reported transcript miss)', () => {
    expect(categories('Student Number: 830417 Grade: 11')).toContain('id');
  });
});

describe('direct layer: dates', () => {
  it.each(['March 3, 2024', '3/14/2008', '2024-03-12', '12 March 2024'])('detects %s', (date) => {
    expect(categories(`Born ${date}.`)).toContain('date');
  });
  it('does not flag a bare year (that is contextual, weight 1)', () => {
    expect(detectDirect('The ceremony took place in 2019.')).toHaveLength(0);
  });
});

describe('direct layer: addresses', () => {
  it('detects a street address', () => {
    const flags = detectDirect('She lives at 4128 Spruce Hill Road with her family.');
    expect(flags.some((f) => f.category === 'address' && f.text === '4128 Spruce Hill Road')).toBe(true);
  });
});

describe('direct layer: overlap handling', () => {
  it('returns non-overlapping flags', () => {
    const flags = detectDirect('Email a@b.org, phone (215) 555-0148, born 3/14/2008.');
    const sorted = [...flags].sort((a, b) => a.start - b.start);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i]!.start).toBeGreaterThanOrEqual(sorted[i - 1]!.end);
    }
  });
});
