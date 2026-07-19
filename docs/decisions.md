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
