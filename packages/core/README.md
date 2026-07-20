# @namemasker/core

The engine behind [NameMasker](https://namemasker.com): local PII detection,
masking, and restore for student documents. Plain TypeScript, zero runtime
dependencies, no network access of any kind. Runs in the browser and in Node.

**The design stance:** the tool stages, the professional approves. Detection
is deliberately layered and each layer is exported on its own, so callers
decide what to trust and what to review.

## Install

```sh
npm install @namemasker/core
```

## Quick start

```ts
import {
  scanDocument,
  createStudentMap,
  addToMap,
  applyMap,
  unmaskText,
} from '@namemasker/core';

const text = 'It is my pleasure to recommend Maya Chen of Lakeside Prep.';

// 1. Scan: returns flags (direct / name / contextual), each with a reason.
const { flags, accumulation } = scanDocument(text);

// 2. The caller (a human, in our UI) approves flags into a map.
const map = createStudentMap();
for (const flag of flags) {
  addToMap(map, { text: flag.text, placeholderType: flag.placeholderType });
}

// 3. Mask: every occurrence, longest match first.
const masked = applyMap(text, map);
// -> 'It is my pleasure to recommend Student A of School 1.'

// 4. Unmask AI output: placeholders restore to canonical names only.
unmaskText('In short, Student A excels.', map.mapping);
// -> 'In short, Maya Chen excels.'
```

## Detection layers

1. **Direct** (`detectDirect`) — deterministic patterns: emails, phones,
   SSN/ID numbers, dates, street addresses. No ML.
2. **Names** — bring your own: pass `nameFlags` from any NER (the NameMasker
   site runs a vendored distilbert-NER in-browser), or fall back to the
   built-in, honestly-labeled naive capitalized-pair pattern
   (`detectNamesNaive`).
3. **Contextual** (`detectContextual`) — weighted heuristics with proximity
   scoring for passages that may identify a student without naming them
   (uniqueness claims, rare activities, school patterns, geographic
   narrowing). These are flags for human judgment; the engine never masks
   them on its own.
4. **Accumulation** — six or more contextual flags in one document raises a
   document-level warning that the combination may identify even after
   masking.

`scanDocument(text, options)` composes all layers. `options.knownTerms`
stages caller-supplied terms (a watchlist, or names from a student record)
with top priority; `options.nameFlags` replaces the naive name layer.

## The map (format v2)

A `StudentMap` is `{ mapping, aliases, watchlist }`:

- `mapping` — canonical real → placeholder (`Student A`, `School 1`), unique
  placeholders; the only section Unmask reads, so restoration is
  deterministic.
- `aliases` — alternate spellings that mask to an existing placeholder
  (bare "Maya" → `Student A`) but never win at unmask.
- `watchlist` — terms to always stage on future scans.

`parseStudentMap` accepts v2 files and lifts v1 flat `{real: placeholder}`
files forever. `serializeStudentMap` writes v2.

## Honest scope

This library does not guarantee anonymity, and neither does anything else.
It catches what software can catch, flags what software can only suspect,
and is built to keep a human in the approval seat. See the
[threat model](https://namemasker.com/security.html).

MIT © Chris Bell
