# NameMasker

This file governs all Claude Code sessions in this repo. Read it fully before any work.

## What this is

NameMasker (namemasker.com) is a free, standalone, fully local tool that stages PII redactions in student documents so independent educational consultants (IECs) can safely use hosted AI services. Paste or drop a document, Mask, review staged replacements, approve, copy the cleaned text out. Paste AI output back in, Unmask, and real names return via a local mapping.

Owner: Chris Bell, Bell College Consulting. This is a public giveaway, MIT licensed, deliberately independent of Chris's other products in branding and infrastructure. It shares a core library with his private practice platform; the site's trust promise may mention that platform generically ("a full IEC dashboard I'm building") as provenance, but never by name, link, or branding — NameMasker must not be anyone's funnel.

## Governing principles (non-negotiable)

1. The tool stages, the professional approves. It never auto-redacts contextual flags and never claims a document is "safe." It reports what it found. The review step is the product.
2. Nothing leaves the browser. No backend, no accounts, no analytics, no telemetry, no third-party CDNs at runtime. The site is static files. Detection, mapping, and restore all run client-side. Any change that causes a runtime network request beyond loading the site's own static assets is a bug of the highest severity.
3. Honest scope everywhere. Copy, UI states, and empty results never overclaim. "No flags" means no patterns fired, not "this is safe." The name itself underclaims deliberately (it does more than names); keep that posture.
4. Reversibility is the killer feature. Mask and Unmask are the two verbs of the entire product. The mapping makes AI work restorable; protect this loop in every design decision.
5. Additive, never destructive. Detection rules are only ever added or refined with corpus cases proving them. Deprecate-then-delete for anything removed.

## Repo structure

Monorepo, npm workspaces:

- packages/core: the engine. Plain TypeScript, zero UI, zero runtime assumptions (must run in browser and Node). Exports detection layers independently, mapping logic, restore. This gets published to npm eventually; write it as a public library from day one.
- apps/site: the giveaway site. Thin UI importing core. Builds to static files. No framework lock-in required, but keep it light: vanilla TS or Preact-class footprint. This is a single-purpose utility, not an app platform.

Dependency policy (security-critical): ruthlessly minimal. Every dependency added must be justified in the commit message. Exact-version pinning via lockfile. No auto-updating. The NER model file (Phase 3) gets vendored into the repo, not fetched from third-party CDNs.

## Detection architecture

Four layers, exposed independently from core:

1. Deterministic regex: emails, phones, ID/SSN patterns, dates, street addresses. No ML.
2. Name detection: Phase 2 ships a clearly-labeled naive capitalized-pair pattern. Phase 3 replaces it with a small quantized NER model via transformers.js, running in-browser, model vendored.
3. Contextual heuristics: weighted rules scored by weight plus proximity-weighted neighboring signals within ~200 chars; passages crossing threshold (default 3) get a yellow flag with a stated reason. Rules are tuned to over-flag mildly. Categories: uniqueness claims (first/only/sole + role), rare roles (valedictorian), award references (including lowercase "award winning"), named awards, rare instruments and soloist roles, named ensembles (Band/Orchestra/Choir/Ensemble/Symphony after capitalized words), school-name patterns ([Cap] High/Prep/Academy), narrow school types (Quaker/Jesuit/Montessori/charter/boarding/magnet + school), school-size mentions, geographic narrowing (outside/near + place), specific achievements (state X title/champion), less common sports, leadership roles (weight 1), anchoring years (weight 1).
4. Document-level accumulation: 6+ contextual fragments in one document triggers a banner: the combination may identify even after redaction. A flag, never a redaction.

Flag taxonomy in the UI: Direct (red, near-certain), Name (distinct color, model/pattern confidence), Contextual (yellow, requires judgment). Every flag shows its reason. Every flag is individually approvable, editable, or dismissible; bulk approve exists.

## Test corpus (seed cases, required in Phase 1 test suite)

- Maya (rec letter): contains an email, a phone number, "Maya Chen", "Lakeside Prep", and the sentence "the first female wrestling captain at my small Quaker school outside Philadelphia" which must yield stacked contextual flags.
- Jenny (the founding miss): "As the award winning tuba soloist in the Colorado Honors Band, Jenny Smith knows music. She comes from Boulder High, but also went to South High, and Fairview. She loves cooking and is on the alpine skiing team and the tennis team, where she was captain in junior year." Version 1 heuristics caught nothing here. Current rules must flag the ensemble, the schools, the award reference, the instrument, and stack the sport/captain signals. The document-level accumulation banner should fire.
- Negative cases: a lone "captain", a bare year, and a generic sentence must produce zero flags. False-positive restraint is a tested property.

Every future rule change adds a corpus case demonstrating it. Community-reported misses become corpus cases with attribution in the commit.

## Mapping and persistence

Mapping is a flat JSON object, real string to placeholder. Placeholder sequences: Student A/B/..., Parent 1/2, School 1/2, Coach 1, etc., assigned in detection order per type.

- Session persistence: localStorage (this is a real website, not a chat artifact; localStorage is fine and expected).
- Portability: export/import as {student}.map.json. This file is the only sensitive artifact the tool creates; the UI says so where export happens.
- Masking pass order: exact-match replacement from loaded mapping first (beats model misses), then new detections get next placeholder in sequence.
- Unmask: mapping applied in reverse, pure substitution.

## Modes

- Essay mode (conservative): direct identifiers staged, voice preserved, contextual passages flagged only.
- Records mode (aggressive): names, birthdates, IDs, addresses, school names all staged.
Same engine, threshold profiles in core, selectable in UI. Phase 5.

## Build phases

Phase 1: core library. Regex layer, heuristic engine, mapping and restore. Test suite with the corpus above. No UI.
Phase 2: site v1, paste-only. Scan, three-kind highlighting, per-flag review, bulk approve, Mask output with copy, Unmask box, localStorage mapping with export/import. PWA manifest and service worker for offline. Product copy from docs/product-text.md. This ships publicly.
Phase 3: NER via transformers.js, vendored quantized model (small, permissively licensed; propose options before choosing), replaces naive name pattern. First-visit model download UX with size stated honestly.
Phase 4: file intake. PDF.js and mammoth, client-side only, cleaned-file download.
Phase 5: modes.
Phase 6: trust hardening. npm publish of core, reproducible-build CI publishing bundle hashes per tagged commit, public security page describing the threat model in plain language.

Do not build ahead of the current phase. Later, only on demonstrated demand: Tauri desktop app, optional local-LLM (Ollama) contextual tier, community rule-contribution workflow.

Out of scope for this repo entirely: any hosted API, any server-side processing, any integration code for other products. The private platform consumes packages/core via npm on its own schedule; that integration lives elsewhere.

## Design brief (the look is the product)

Chris will iterate heavily on visual design; treat it as first-class work, not decoration on the engine.

Process requirement: before writing any site UI code, produce a short design plan for approval: a named palette (4-6 hex values), type pairing (characterful display face used with restraint, complementary body face), a one-paragraph layout concept, and one signature element the design will be remembered by. Present the plan, wait for approval, then build to it exactly. Iterate in this plan-approve-build loop for subsequent design passes.

Direction constraints:
- Independent public-good aesthetic. Do NOT use Bell College Consulting branding (no chartreuse #beca24, no Fraunces/Figtree). NameMasker must not look like anyone's funnel.
- The metaphor is the mask: something put on and taken off. Reversibility should be felt in the design. Mask and Unmask are the two primary actions and the vocabulary throughout (buttons, headings, copy).
- The audience is professional and privacy-anxious. The design should read as a calm, trustworthy instrument: closer to a well-made utility than a startup landing page. Clarity beats cleverness.
- Avoid AI-default looks: warm-cream + serif + terracotta; near-black + acid accent; broadsheet hairlines. Make choices specific to this product.
- The highlight colors inside scanned text are load-bearing information design (three flag kinds plus approved state); design them as a system with the palette, including color-blind-safe distinctions and non-color affordances.
- Quality floor without announcement: responsive to mobile, visible keyboard focus, reduced motion respected, WCAG AA contrast.
- Copy voice: plain verbs, sentence case, honest scope. Buttons say what they do: Mask, Unmask, Approve all. Empty states direct, never apologize.

## Engineering conventions

- Plan mode default. For any change touching detection rules, the mapping format, or the service worker: present the plan, get approval, then write.
- No secrets exist in this project; there is nothing to leak, keep it that way. No env vars required at runtime.
- Conventional commit prefixes; docs: for documentation.
- docs/ carries: product-text.md (site copy source of truth), decisions.md (lightweight ADR log, seeded with the naming decision and web-first-PWA decision), threat-model.md (Phase 6 expands to the public security page).
- Hosting: static deploy. Target either Dreamhost (rsync via GitHub Action from protected main) or Vercel (git-triggered); Chris decides at first deploy. Build must be host-agnostic static output.
- Reproducible builds are a Phase 6 requirement; avoid build-time nondeterminism (timestamps, hash salts) from the start so Phase 6 is cheap.

## Session ritual

Start of session: read this file, docs/decisions.md, and the current phase's open issues. End of session: route changes to docs (decisions to decisions.md, copy changes to product-text.md), commit with proper prefixes, push. Never advance a phase without Chris confirming the current one is done.
