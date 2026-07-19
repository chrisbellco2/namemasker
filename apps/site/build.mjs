// Static build: bundle src/main.ts, copy static/, stamp the service worker
// with a deterministic content-hash cache version (no timestamps — Phase 6
// reproducible builds must stay cheap).
import { build } from 'esbuild';
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const dist = join(root, 'dist');

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

await build({
  entryPoints: [
    { in: join(root, 'src/main.ts'), out: 'app' },
    { in: join(root, 'src/ner-worker.ts'), out: 'ner-worker' },
  ],
  bundle: true,
  minify: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  outdir: dist,
  legalComments: 'none',
  alias: { '@namemasker/core': join(root, '../../packages/core/src/index.ts') },
});

cpSync(join(root, 'static'), dist, { recursive: true });

// Vendor the pdf.js worker; nothing loads from a CDN.
cpSync(
  join(root, '../../node_modules/pdfjs-dist/build/pdf.worker.min.mjs'),
  join(dist, 'pdf.worker.min.mjs'),
);

// Vendor the onnxruntime wasm runtime; nothing loads from a CDN.
const ortSrc = join(root, '../../node_modules/onnxruntime-web/dist');
mkdirSync(join(dist, 'ort'), { recursive: true });
for (const f of readdirSync(ortSrc)) {
  if (/^ort-wasm.*\.(wasm|mjs)$/.test(f)) cpSync(join(ortSrc, f), join(dist, 'ort', f));
}

// Deterministic cache version: sha256 over sorted dist contents.
const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else files.push(p);
  }
};
walk(dist);
const hash = createHash('sha256');
for (const f of files) hash.update(f.slice(dist.length)).update(readFileSync(f));
const version = hash.digest('hex').slice(0, 12);

const sw = readFileSync(join(root, 'src/sw.js'), 'utf8').replace('__CACHE_VERSION__', version);
writeFileSync(join(dist, 'sw.js'), sw);
console.log(`built dist/ (cache version ${version})`);
