# Decisions

Lightweight ADR log. Newest entries at the bottom. One heading per decision;
keep entries short enough to read in one sitting.

## 1. Name: NameMasker (2026-07)

The name deliberately underclaims. The tool detects more than names (emails,
phones, IDs, dates, addresses, contextual identification), but "NameMasker"
promises less than the tool does rather than more. Rejected: any name implying
guaranteed anonymity or "safety," which the tool will never claim.

## 2. Web-first PWA, not desktop app (2026-07)

Ship as a static website with a service worker for offline use. Zero install
friction matters more to the audience than a desktop binary, and "open your
network inspector and watch" is a trust argument only a web page can make.
A Tauri desktop app remains a possibility later, only on demonstrated demand.

## 3. Test runner: vitest (2026-07-18)

Approved by Chris. Dev-only dependency of packages/core, exact-pinned. Chosen
for native TypeScript support with no transpilation config, which keeps the
dependency count at two (typescript, vitest).

## 4. Fairview list-continuation rule ships in Phase 1 (2026-07-18)

Approved by Chris. Corpus case: Jenny ("She comes from Boulder High, but also
went to South High, and Fairview."). Version 1 heuristics missed "Fairview"
because it carries no school suffix. Rule: once a school-name pattern matches,
capitalized tokens continuing the same comma/and list are staged as probable
schools (category `school-list-continuation`, weight 2). The chain breaks at
the first lowercase word or end of list, which keeps the rule from wandering
into unrelated text.
