/**
 * The Phase 3 name layer: a quantized distilbert-NER model running entirely
 * inside this worker via transformers.js. Model and runtime are vendored
 * static assets on this site's own origin — allowRemoteModels is off, so no
 * request can ever leave the origin, and the document text never leaves the
 * browser at all.
 */
import { env, pipeline } from '@huggingface/transformers';

env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = '/model/';
// The service worker is the single cache; don't double-store 65 MB.
env.useBrowserCache = false;
if (env.backends.onnx?.wasm) env.backends.onnx.wasm.wasmPaths = '/ort/';

export type NerLabel = 'PER' | 'ORG' | 'LOC' | 'MISC';

export interface NerSpan {
  label: NerLabel;
  score: number;
  start: number;
  end: number;
  text: string;
}

interface RawToken {
  entity: string;
  score: number;
  word: string;
}

/**
 * The pipeline reports tokens, not character offsets; recover offsets by
 * walking the text with a cursor. Requesting all tokens (ignore_labels: [])
 * keeps the cursor aligned even when an entity word also appears earlier
 * in the text untagged.
 */
export function tokensToSpans(text: string, tokens: RawToken[]): NerSpan[] {
  const spans: NerSpan[] = [];
  let cursor = 0;
  let cur: { label: NerLabel; scores: number[]; start: number; end: number } | null = null;

  const flush = (): void => {
    if (cur === null) return;
    const score = cur.scores.reduce((a, b) => a + b, 0) / cur.scores.length;
    const spanText = text.slice(cur.start, cur.end);
    if (spanText.trim().length > 1 && score >= 0.5) {
      spans.push({ label: cur.label, score, start: cur.start, end: cur.end, text: spanText });
    }
    cur = null;
  };

  for (const tok of tokens) {
    const raw = tok.word;
    if (raw.startsWith('[') && raw.endsWith(']')) continue; // [CLS], [SEP], [UNK]
    const sub = raw.startsWith('##');
    const piece = sub ? raw.slice(2) : raw;
    const at = text.indexOf(piece, cursor);
    if (at === -1) continue;
    cursor = at + piece.length;

    const entity = tok.entity ?? 'O';
    if (entity === 'O') {
      if (sub && cur !== null) {
        cur.end = cursor; // subword of the current entity's last word
        cur.scores.push(tok.score);
      } else {
        flush();
      }
      continue;
    }
    const label = entity.slice(2) as NerLabel;
    const isBegin = entity.startsWith('B-');
    if (cur !== null && (sub || (!isBegin && cur.label === label))) {
      cur.end = cursor;
      cur.scores.push(tok.score);
    } else {
      flush();
      cur = { label, scores: [tok.score], start: at, end: cursor };
    }
  }
  flush();
  return spans;
}

type NerPipeline = (text: string, options: { ignore_labels: string[] }) => Promise<RawToken[]>;
let ner: NerPipeline | null = null;

async function loadModel(): Promise<void> {
  try {
    ner = (await pipeline('token-classification', 'distilbert-NER', {
      dtype: 'int8',
      progress_callback: (p: { status?: string; file?: string; progress?: number }) => {
        if (p.status === 'progress' && p.file?.includes('model_int8') && typeof p.progress === 'number') {
          postMessage({ type: 'progress', progress: p.progress });
        }
      },
    })) as unknown as NerPipeline;
    postMessage({ type: 'ready' });
  } catch (err) {
    postMessage({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
}
const loading = loadModel();

self.onmessage = async (ev: MessageEvent<{ type: string; id: number; text: string }>) => {
  if (ev.data.type !== 'scan') return;
  const { id, text } = ev.data;
  await loading;
  if (ner === null) {
    postMessage({ type: 'result', id, spans: [], failed: true });
    return;
  }
  try {
    const tokens = await ner(text, { ignore_labels: [] });
    postMessage({ type: 'result', id, spans: tokensToSpans(text, tokens) });
  } catch {
    postMessage({ type: 'result', id, spans: [], failed: true });
  }
};
