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

## 5. Phase 2 design: "Greenroom" plan approved (2026-07-18)

Approved by Chris. Palette: Graphite #22272B, Cool paper #F4F6F5, Verdigris
#1F6F60, Signal red #B3402E (direct), Iris #4F5BC4 (name), Amber #B57A19
(contextual). Kind is never carried by hue alone: distinct underline styles
(solid/dashed/dotted) plus rail glyphs. Type: Bricolage Grotesque display +
Public Sans body, vendored woff2, no CDN. Signature element: "the flip" —
one workspace card with a light Mask face and a dark Unmask face, 3D-turned
on mode switch (crossfade under reduced motion), wordmark chip flips
Name ⇄ Student A.

## 6. Site toolchain: esbuild only (2026-07-18)

The site builds with a single dev dependency (esbuild) driven by a small
build script; HTML, CSS, service worker, and manifest are hand-written. No
framework, no bundler config surface. The service worker cache version is a
content hash of dist, keeping builds deterministic for Phase 6.

## 7. GitHub repo private until Phase 2 ships reviewed (2026-07-18)

Chris's call. github.com/chrisbellco2/namemasker starts private; flip to
public when the site is reviewed and live, consistent with the open-source
trust posture without exposing half-built work.

## 8. Deploy: GitHub Action -> FTPS to the existing static host (2026-07-18)

Chris's host takes FTP uploads, so first deploy target is that host rather
than Vercel. A GitHub Action builds the site (npm ci from the exact
lockfile, tests must pass) and uploads apps/site/dist over FTPS via
SamKirkland/FTP-Deploy-Action, pinned to a commit SHA per dependency
policy. Credentials are GitHub repository secrets that only Chris enters.
Manual-trigger (workflow_dispatch) until the first deploy is confirmed
good; then the push-to-main trigger gets uncommented. If the host turns
out to support SSH/SFTP (Dreamhost does), switch to rsync over SSH.

Superseded same evening: Chris confirmed the host is Dreamhost, so the
workflow now uses rsync over SSH with a dedicated ed25519 deploy keypair
(private half stored as the DEPLOY_SSH_KEY repo secret via gh, public half
added to the Dreamhost shell user's authorized_keys). No third-party deploy
action at all — plain rsync in a run step. Host key is trusted on first
use (StrictHostKeyChecking=accept-new).

## 8b. Deploy user: shared account, isolation deferred (2026-07-18)

First deploy attempted a dedicated `namemasker` shell user for blast-radius
isolation, but the DreamHost panel offered no way to move the domain to
that user, and the domain was already configured to serve
/home/<shell-user>/sites/namemasker.com. Chris chose to deploy as
<the main shell user>. Accepted trade-off, on the record: the CI deploy key can
write to everything that account hosts (a dozen other
domains), not just namemasker.com. Revisit if isolation ever matters
(DreamHost support can move the domain between users on request). The
unused `namemasker` user and its copy of the site can be deleted at
cleanup.

## 9. Phase 3 NER model: dslim/distilbert-NER, int8, vendored (2026-07-18)

Chris approved option 1 of three proposed (distilbert-NER ~65 MB int8 vs
bert-base-NER ~110 MB vs GLiNER-small ~150 MB). Apache-2.0, CoNLL-2003
labels (PER/ORG/LOC/MISC). The official dslim ONNX export is fp32 only
(261 MB), so scripts/quantize-model.py reproduces the vendored int8
artifact (65.8 MB) from it with onnxruntime dynamic quantization
(QInt8, per_channel, reduce_range — transformers.js conversion defaults).
Runs in a Web Worker via @huggingface/transformers with
allowRemoteModels=false; model files and the onnxruntime wasm runtime are
vendored same-origin static assets. The naive capitalized-pair layer stays
in core as the documented fallback when the model fails to load, and core
accepts external name flags via ScanOptions.nameFlags.

Dependency security note: transformers.js pulls onnxruntime-node (unused;
Node-only, excluded from the browser bundle) which pinned a vulnerable
adm-zip; a root npm override forces adm-zip 0.6.0, npm audit clean.

Known follow-up for a future mapping-format decision: a bare first name
("Maya") currently gets its own placeholder (Student B) instead of linking
to the already-mapped "Maya Chen" (Student A). Alias support means allowing
duplicate placeholder values with longest-real-wins on unmask — a format
semantics change that needs Chris's sign-off first.

## 9b. Map format v2, aliases, watchlist, knownTerms, inline review (2026-07-19)

Chris approved after discussion. The map file is now versioned
(namemasker-map@2) with three sections: mapping (canonical real ->
placeholder, unique, the only thing Unmask reads — restoration stays
deterministic), aliases (alternate spellings masking to an existing
placeholder; created automatically when a bare word of an already-mapped
person is approved), and watchlist (always-flag terms; staged pre-approved
on every scan, dismissible per document, deletable without breaking
anything). v1 flat files import forever; localStorage migrates silently.
Core gained ScanOptions.knownTerms — the shared primitive the site feeds
from the watchlist and the private platform will feed from student
records; that integration code stays out of this repo per the charter.
Review UX: the document is the primary surface — click any highlight (in
either pane) for a popover with reason and actions; select text anywhere
for a "Mask this" chip; the rail collapsed into a summary bar with a
Details toggle. Semantics worth remembering: deleting from watchlist or
aliases is always safe; deleting a mapping entry is the only destructive
act.

## 10. Phase 4 file intake: pdfjs-dist + mammoth, text-out download (2026-07-19)

Phase 3 closed by Chris; auto-deploy on push to main enabled at the same
time. Intake: pdfjs-dist 6.1.200 (pdf.worker vendored, no CDN) and mammoth
1.12.0, both exact-pinned, extraction fully client-side. Scanned/image
PDFs get an honest "this tool does not read images" error instead of empty
output. "Cleaned-file download" ships as {original-name}.masked.txt — a
text file, not a rebuilt PDF/DOCX; regenerating formatted documents
client-side is out of scope until demand proves it.

## 11. Domino, the mascot (2026-07-19)

Chris approved after three preview rounds. An original raccoon — the
naturally masked animal — with the mask drawn in verdigris: the brand
color literally doing the masking. Explicitly NOT an imitation of any
existing character (the inspiration prompt mentioned Dora's Swiper, who
is Nickelodeon IP; nothing of that design carried over). Body: option B
(round ears, glint eyes, small smile). Three moments only, never near
the flags: peeking inside the empty paste box (tail trailing along the
border), paws over his eyes while a scan runs — even the mascot doesn't
look, Chris's idea — and a small pop beside "all reviewed". Section
headings carry his tail as a ringed underline stroke. All entrances are
static under prefers-reduced-motion. Hand-drawn inline SVG in
apps/site/src/domino.ts, palette-fixed, zero dependencies.

## 12. Tagline, trust copy, repo public (2026-07-19)

Chris approved the tagline "Mask before AI. Unmask after. Nothing leaves
your browser." — the product's two verbs doing the explaining. The trust
section gained a plain-language preamble (a website that sends nothing;
masking is find-and-replace; the one AI part runs on-device like a
spell-checker) and now links to this repository, which goes public. Before
the flip, history was rewritten with git-filter-repo to scrub a real
student number that had landed in a corpus test and commit message, and to
redact the shell username, home path, and unrelated-domain details from
the deploy ADRs. A pre-scrub backup clone was kept locally.

## 13. The trust promise (2026-07-19)

Chris's structure: Promise -> How -> Proof. The trust section now opens
with a first-person signed promise from Chris, including provenance — the
same masking engine powers the IEC dashboard he is building for his own
practice, mentioned generically per the amended charter rule (no name, no
link, no branding; NameMasker is not a funnel) — and closes with "free, of
course." The four verification steps remain, reframed as "a promise is
only worth what you can check."

## 14. Phase 5 redefined: no mode toggle, a scoped Approve all (2026-07-19)

Chris challenged whether an Essay/Records mode was worth the UI and mental
model; on inspection the toggle's case collapsed — "Approve all" already
gives the records workflow one-click bulk staging, so a persistent mode
would have bought one click and a threshold tweak at the price of
invisible global state. Shipped instead: "Approve all but yellow" beside
"Approve all" — the essay-safe bulk action that masks direct identifiers
and names while leaving every contextual judgment to the professional.
The choice happens at the moment it matters, in view of the flags, with
no standing state. Core profiles remain available to API consumers via
ScanOptions. Phase 5 is closed by this decision.

## 15. Public security page ships (2026-07-19)

Phase 6, first of three. security.html carries the threat model in plain
language, Chris-approved copy: what the tool exists for, what it never
does, the map file as the one sensitive artifact, four honest residual
risks, and a fix-it-fastest reporting note. Linked from the trust section
and footer; served network-first and precached. Remaining Phase 6 work
(npm publish of core, reproducible-build CI with published hashes) is
scheduled before the Wednesday demo freeze.

## 16. Reproducible-build releases; Phase 6 complete (2026-07-19)

The release-hashes workflow runs on every v* tag: npm ci from the exact
lockfile, tests, then the site is built twice and the run fails unless
both builds are byte-identical (verified locally first: 24 files,
byte-identical). SHA-256 hashes of every built file plus the
@namemasker/core tarball are published as the tag's GitHub release, so
anyone can rebuild from public source and compare against what the site
serves. @namemasker/core 0.1.0 published to npm by Chris (interactive,
2FA; automation would use OIDC trusted publishing per npm's 2026
deprecation of bypass tokens). With the security page, the npm publish,
and this workflow, Phase 6's three deliverables are shipped.
