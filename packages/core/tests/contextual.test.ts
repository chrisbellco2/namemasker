import { describe, expect, it } from 'vitest';
import { collectSignals, detectContextual } from '../src/index';

describe('contextual rules: individual signals', () => {
  const signalCategories = (text: string) => collectSignals(text).map((s) => s.category);

  it('sees a uniqueness claim', () => {
    expect(signalCategories('She was the first female wrestling captain here.')).toContain('uniqueness-claim');
  });

  it('sees a rare role', () => {
    expect(signalCategories('She is our valedictorian this spring.')).toContain('rare-role');
  });

  it('sees a lowercase award reference', () => {
    expect(signalCategories('An award winning writer, no doubt.')).toContain('award-reference');
  });

  it('sees a named award', () => {
    expect(signalCategories('She received the Whitfield Merit Scholarship in the spring.')).toContain('named-award');
  });

  it('sees a rare instrument with soloist role as one signal', () => {
    const signals = collectSignals('She is a tuba soloist of real skill.');
    const hits = signals.filter((s) => s.category === 'rare-instrument');
    expect(hits).toHaveLength(1);
    expect(hits[0]!.text).toBe('tuba soloist');
  });

  it('sees a named ensemble', () => {
    const signals = collectSignals('She plays in the Colorado Honors Band each fall.');
    expect(signals.some((s) => s.category === 'named-ensemble' && s.text === 'Colorado Honors Band')).toBe(true);
  });

  it('sees school-name patterns', () => {
    const cats = signalCategories('She went from Lakeside Prep to Boulder High.');
    expect(cats.filter((c) => c === 'school-name')).toHaveLength(2);
  });

  it('sees a narrow school type and a school-size mention', () => {
    const cats = signalCategories('at my small Quaker school in the hills');
    expect(cats).toContain('narrow-school-type');
    expect(cats).toContain('school-size');
  });

  it('sees geographic narrowing', () => {
    const signals = collectSignals('a farm town outside Philadelphia, quite remote');
    expect(signals.some((s) => s.category === 'geographic-narrowing' && s.text.includes('Philadelphia'))).toBe(true);
  });

  it('sees a specific achievement', () => {
    expect(signalCategories('She holds a state fencing title from last year.')).toContain('specific-achievement');
  });

  it('sees an uncommon sport, a leadership role, and an anchoring year', () => {
    const cats = signalCategories('Wrestling captain since her junior year.');
    expect(cats).toContain('uncommon-sport');
    expect(cats).toContain('leadership-role');
    expect(cats).toContain('anchoring-year');
  });
});

describe('the Fairview list-continuation rule', () => {
  it('flags a suffixless school continuing a list begun by a detected school', () => {
    const signals = collectSignals('She comes from Boulder High, but also went to South High, and Fairview.');
    const continuation = signals.filter((s) => s.category === 'school-list-continuation');
    expect(continuation).toHaveLength(1);
    expect(continuation[0]!.text).toBe('Fairview');
  });

  it('breaks the chain at a lowercase word', () => {
    const signals = collectSignals('She comes from Boulder High, but never lost her focus.');
    expect(signals.some((s) => s.category === 'school-list-continuation')).toBe(false);
  });

  it('does not double-count a school the school-name rule already caught', () => {
    const signals = collectSignals('She went to South High, and Lakeside Prep.');
    expect(signals.filter((s) => s.category === 'school-list-continuation')).toHaveLength(0);
    expect(signals.filter((s) => s.category === 'school-name')).toHaveLength(2);
  });

  it('needs a detected school to start the chain', () => {
    const signals = collectSignals('She likes Boulder, and Fairview.');
    expect(signals.some((s) => s.category === 'school-list-continuation')).toBe(false);
  });
});

describe('contextual scoring', () => {
  it('a lone weight-1 signal never crosses the threshold', () => {
    const { flags } = detectContextual('She was named captain of the team.');
    expect(flags).toHaveLength(0);
  });

  it('a lone weight-3 signal flags on its own', () => {
    const { flags } = detectContextual('She is our valedictorian.');
    expect(flags.some((f) => f.category === 'rare-role')).toBe(true);
  });

  it('stacked weak signals cross the threshold together', () => {
    const { flags } = detectContextual('the first female wrestling captain at my small Quaker school outside Philadelphia');
    expect(flags.length).toBeGreaterThanOrEqual(3);
  });

  it('every flag states its reason with score and threshold', () => {
    const { flags } = detectContextual('She is our valedictorian.');
    expect(flags[0]!.reason).toMatch(/score \d/);
    expect(flags[0]!.reason).toMatch(/threshold 3/);
  });

  it('distant signals do not support each other', () => {
    const filler = ' The weather was mild and the season went on as seasons do.'.repeat(8);
    const { flags } = detectContextual(`She was captain of the team.${filler} The year 2019 mattered to her.`);
    expect(flags).toHaveLength(0);
  });
});
