# NameMasker

**Mask before AI. Unmask after. Nothing leaves your browser.**

[namemasker.com](https://namemasker.com) is a free, fully local tool that
stages redactions in student documents so independent educational consultants
can use hosted AI services without handing over who their students are. Paste
or drop in a document, press **Mask**, review every staged replacement, and
copy the cleaned text out. Paste the AI's output back in, press **Unmask**,
and the real names return.

Everything runs in your browser: deterministic patterns for emails, phones,
IDs, dates, and addresses; a small vendored NER model (distilbert-NER,
int8, ~65 MB) for names, running on-device via transformers.js; weighted
contextual heuristics for passages that might identify a student without
naming them; and plain find-and-replace for the masking itself. There is no
server, no account, no analytics, and no network request beyond loading the
site's own static files. Turn off your internet after the first visit and
everything keeps working.

One promise this tool will not make: it does not "guarantee anonymity." It
catches what software can catch, flags what software can only suspect, and
puts you — the professional who knows the student — in the approval seat for
everything. The review step is the product.

## Repository layout

- `packages/core` — the engine: detection layers (each exported
  independently), the map format (mask/unmask, aliases, watchlist), and the
  test corpus. Plain TypeScript, no runtime dependencies, runs in browser
  and Node.
- `apps/site` — the site: hand-written HTML/CSS, a thin TypeScript UI, a
  service worker for offline use, and the vendored model + wasm runtime.
  Built with esbuild to static files.
- `docs/` — product copy, the decision log, and the threat model.

## Development

```sh
npm install
npm test                      # core test suite (the corpus lives here)
npm -w @namemasker/site run build   # static site into apps/site/dist
```

Detection rules are only ever added or refined, and every rule change ships
with a corpus case demonstrating it — see `packages/core/tests`. Community
reports of misses are welcome; they become corpus cases with attribution.

## License

MIT. The vendored NER model derives from
[dslim/distilbert-NER](https://huggingface.co/dslim/distilbert-NER)
(Apache-2.0); `scripts/quantize-model.py` reproduces the int8 artifact from
the official fp32 ONNX export.
