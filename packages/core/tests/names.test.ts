import { describe, expect, it } from 'vitest';
import { detectNamesNaive } from '../src/index';

describe('naive name layer (Phase 2 pattern, replaced by NER in Phase 3)', () => {
  it('detects a capitalized pair', () => {
    const flags = detectNamesNaive('I recommend Maya Chen without reservation.');
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({ kind: 'name', text: 'Maya Chen', placeholderType: 'student' });
  });

  it('labels itself honestly as naive in the reason', () => {
    const [flag] = detectNamesNaive('I recommend Maya Chen.');
    expect(flag!.reason).toMatch(/naive/i);
  });

  it('detects a name with a middle initial', () => {
    const flags = detectNamesNaive('Please welcome Jenny R. Smith to the stage.');
    expect(flags.map((f) => f.text)).toContain('Jenny R. Smith');
  });

  it('leaves school and ensemble words to the contextual layer', () => {
    expect(detectNamesNaive('She attends Boulder High and Lakeside Prep.')).toHaveLength(0);
    expect(detectNamesNaive('She plays in the Colorado Honors Band.')).toHaveLength(0);
  });

  it('recovers a name after a leading stopword', () => {
    const flags = detectNamesNaive('The Maya Chen you met is my student.');
    expect(flags.map((f) => f.text)).toContain('Maya Chen');
  });

  it('produces nothing on lowercase prose', () => {
    expect(detectNamesNaive('she works hard and cares about her classmates.')).toHaveLength(0);
  });
});
