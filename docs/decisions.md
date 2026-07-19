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
