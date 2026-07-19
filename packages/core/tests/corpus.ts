/**
 * Seed test corpus, required by Phase 1 (CLAUDE.md). Every future rule change
 * adds a case here demonstrating it. Community-reported misses become cases
 * with attribution in the commit.
 */

export const MAYA_LETTER = `Dear Admissions Committee,

It is my pleasure to recommend Maya Chen for admission. In my eleven years
teaching English at Lakeside Prep, few students have shown her combination
of grit and grace.

Maya became the first female wrestling captain at my small Quaker school outside
Philadelphia, and she carried that distinction with humility.

You are welcome to contact me at j.rivera@lakesideprep.org or (215) 555-0148
with any questions.
`;

// "The founding miss": version 1 heuristics caught nothing in this document.
export const JENNY_DOC =
  'As the award winning tuba soloist in the Colorado Honors Band, Jenny Smith ' +
  'knows music. She comes from Boulder High, but also went to South High, and ' +
  'Fairview. She loves cooking and is on the alpine skiing team and the tennis ' +
  'team, where she was captain in junior year.';

// False-positive restraint is a tested property: each must yield ZERO flags.
export const NEGATIVE_CASES: Record<string, string> = {
  'a lone captain': 'She was named captain of the team.',
  'a bare year': 'The ceremony took place in 2019.',
  'a generic sentence': 'She works hard and cares deeply about her classmates.',
};
