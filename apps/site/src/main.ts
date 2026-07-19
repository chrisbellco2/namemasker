import {
  scanDocument,
  maskText,
  unmaskText,
  nextPlaceholder,
  parseMapping,
  serializeMapping,
  type Flag,
  type Mapping,
  type PlaceholderType,
} from '@namemasker/core';

// ---------- state ----------

type FlagStatus = 'pending' | 'approved' | 'dismissed';

interface UIFlag {
  id: number;
  flag: Flag;
  status: FlagStatus;
  /** The exact string that will be replaced; editable. */
  target: string;
  type: PlaceholderType;
  /** True for exact matches of an already-loaded mapping entry. */
  fromMapping: boolean;
}

const STORAGE_KEY = 'namemasker.mapping.v1';

let mapping: Mapping = loadMapping();
/** Keys added by approvals this session; safe to remove on undo. */
const sessionAdded = new Set<string>();
let uiFlags: UIFlag[] = [];
let docText = '';
let nextId = 1;

function loadMapping(): Mapping {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? parseMapping(raw) : {};
  } catch {
    return {};
  }
}

function saveMapping(): void {
  try {
    localStorage.setItem(STORAGE_KEY, serializeMapping(mapping));
  } catch {
    /* private mode: session-only */
  }
}

// ---------- dom ----------

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const docInput = $<HTMLTextAreaElement>('doc-input');
const scanStatus = $('scan-status');
const review = $('review');
const accumBanner = $('accum-banner');
const docview = $('docview');
const flagList = $<HTMLUListElement>('flag-list');
const flagCount = $('flag-count');
const maskedOutput = $('masked-output');
const pendingNote = $('pending-note');
const unmaskInput = $<HTMLTextAreaElement>('unmask-input');
const unmaskOutput = $('unmask-output');
const unmaskResult = $('unmask-result');
const unmaskStatus = $('unmask-status');
const mappingCount = $('mapping-count');

const TYPE_OPTIONS: Array<[PlaceholderType, string]> = [
  ['student', 'Student'],
  ['parent', 'Parent'],
  ['school', 'School'],
  ['coach', 'Coach'],
  ['org', 'Organization'],
  ['place', 'Place'],
  ['email', 'Email'],
  ['phone', 'Phone'],
  ['id', 'ID'],
  ['date', 'Date'],
  ['address', 'Address'],
  ['other', 'Detail'],
];

const GLYPH: Record<Flag['kind'], string> = { direct: '●', name: '◆', contextual: '▲' };

// ---------- mode flip ----------

const tabMask = $<HTMLButtonElement>('tab-mask');
const tabUnmask = $<HTMLButtonElement>('tab-unmask');
const faceMask = $('face-mask');
const faceUnmask = $('face-unmask');

function setMode(mode: 'mask' | 'unmask'): void {
  const unmask = mode === 'unmask';
  document.body.classList.toggle('mode-unmask', unmask);
  tabMask.setAttribute('aria-selected', String(!unmask));
  tabUnmask.setAttribute('aria-selected', String(unmask));
  // Both faces stay in the DOM for the flip; the hidden one must be inert.
  faceMask.toggleAttribute('hidden', false);
  faceUnmask.toggleAttribute('hidden', false);
  faceMask.setAttribute('aria-hidden', String(unmask));
  faceUnmask.setAttribute('aria-hidden', String(!unmask));
  faceMask.toggleAttribute('inert', unmask);
  faceUnmask.toggleAttribute('inert', !unmask);
  syncCardHeight();
}

function syncCardHeight(): void {
  const card = $('card');
  const active = document.body.classList.contains('mode-unmask') ? faceUnmask : faceMask;
  card.style.height = `${active.scrollHeight + 2}px`;
}

tabMask.addEventListener('click', () => setMode('mask'));
tabUnmask.addEventListener('click', () => setMode('unmask'));
for (const tab of [tabMask, tabUnmask]) {
  tab.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      const other = tab === tabMask ? tabUnmask : tabMask;
      other.focus();
      other.click();
    }
  });
}

// ---------- on-device name model ----------

interface NerSpan {
  label: 'PER' | 'ORG' | 'LOC' | 'MISC';
  score: number;
  start: number;
  end: number;
  text: string;
}

const NER_KIND: Record<NerSpan['label'], { category: string; type: PlaceholderType; what: string }> = {
  PER: { category: 'ner-per', type: 'student', what: 'a person' },
  ORG: { category: 'ner-org', type: 'org', what: 'an organization' },
  LOC: { category: 'ner-loc', type: 'place', what: 'a place' },
  MISC: { category: 'ner-misc', type: 'other', what: 'a proper noun' },
};

const modelStatus = $('model-status');
const nerWorker = new Worker('ner-worker.js', { type: 'module' });
let modelReady = false;
let modelFailed = false;
let queuedScan = false;
let scanId = 0;

function nerSpansToFlags(spans: NerSpan[]): Flag[] {
  return spans.map((s) => {
    const kind = NER_KIND[s.label];
    return {
      kind: 'name' as const,
      category: kind.category,
      start: s.start,
      end: s.end,
      text: s.text,
      reason: `Looks like ${kind.what}: tagged ${s.label} by the on-device model (${Math.round(s.score * 100)}% confidence)`,
      placeholderType: kind.type,
    };
  });
}

nerWorker.onmessage = (ev: MessageEvent) => {
  const msg = ev.data as { type: string; progress?: number; id?: number; spans?: NerSpan[]; failed?: boolean };
  if (msg.type === 'progress') {
    modelStatus.textContent = `Downloading the on-device name model — ${Math.round(msg.progress ?? 0)}% of about 65 MB. One time; cached for offline use after this.`;
  } else if (msg.type === 'ready') {
    modelReady = true;
    modelStatus.textContent = 'Name model ready. Names are detected on your device; nothing is sent anywhere.';
    if (queuedScan) runScan();
  } else if (msg.type === 'error') {
    modelFailed = true;
    modelStatus.textContent =
      'The name model could not load. Using the basic name pattern this session; it misses more than the model does.';
    if (queuedScan) runScan();
  } else if (msg.type === 'result' && msg.id === scanId) {
    finishScan(msg.failed === true ? undefined : nerSpansToFlags(msg.spans ?? []));
  }
};
nerWorker.onerror = () => {
  modelFailed = true;
  modelStatus.textContent =
    'The name model could not load. Using the basic name pattern this session; it misses more than the model does.';
  if (queuedScan) runScan();
};

// ---------- masking flow ----------

function runScan(): void {
  queuedScan = false;
  if (modelFailed) {
    finishScan(undefined);
    return;
  }
  scanId++;
  scanStatus.textContent = 'Scanning on your device…';
  nerWorker.postMessage({ type: 'scan', id: scanId, text: docText });
}

$('btn-mask').addEventListener('click', () => {
  docText = docInput.value;
  if (docText.trim().length === 0) {
    scanStatus.textContent = 'Paste a document to begin.';
    review.hidden = true;
    syncCardHeight();
    return;
  }
  if (!modelReady && !modelFailed) {
    queuedScan = true;
    scanStatus.textContent = 'Waiting for the on-device name model, then scanning…';
    return;
  }
  runScan();
});

/** undefined nameFlags = model unavailable; core falls back to the naive pattern. */
function finishScan(nameFlags: Flag[] | undefined): void {
  const result = scanDocument(docText, nameFlags === undefined ? {} : { nameFlags });
  uiFlags = [];
  nextId = 1;

  // Loaded mapping first: exact matches arrive pre-approved. This beats
  // pattern misses and keeps placeholders stable across documents.
  const covered: Array<{ start: number; end: number }> = [];
  for (const real of Object.keys(mapping).sort((a, b) => b.length - a.length)) {
    let idx = docText.indexOf(real);
    while (idx !== -1) {
      const span = { start: idx, end: idx + real.length };
      if (!covered.some((c) => span.start < c.end && c.start < span.end)) {
        covered.push(span);
        if (!uiFlags.some((f) => f.target === real)) {
          uiFlags.push({
            id: nextId++,
            flag: {
              kind: 'name',
              category: 'mapping',
              start: span.start,
              end: span.end,
              text: real,
              reason: 'In your loaded mapping',
              placeholderType: 'other',
            },
            status: 'approved',
            target: real,
            type: 'other',
            fromMapping: true,
          });
        }
      }
      idx = docText.indexOf(real, span.end);
    }
  }

  for (const flag of result.flags) {
    if (covered.some((c) => flag.start < c.end && c.start < flag.end)) continue;
    uiFlags.push({
      id: nextId++,
      flag,
      status: 'pending',
      target: flag.text,
      type: flag.placeholderType,
      fromMapping: false,
    });
  }

  accumBanner.hidden = !result.accumulation.triggered;
  accumBanner.textContent = result.accumulation.message ?? '';

  const n = uiFlags.filter((f) => !f.fromMapping).length;
  const matched = uiFlags.length - n;
  const matchedNote = matched > 0 ? ` ${matched} mapping entr${matched === 1 ? 'y' : 'ies'} matched.` : '';
  scanStatus.textContent =
    n === 0
      ? `No new flags. No patterns fired — that is not a guarantee of safety. Review the document yourself.${matchedNote}`
      : `${n} flag${n === 1 ? '' : 's'} staged for your review.${matchedNote}`;

  review.hidden = false;
  renderAll();
}

function approvedItems(): Array<{ target: string; type: PlaceholderType }> {
  return uiFlags.filter((f) => f.status === 'approved').map((f) => ({ target: f.target, type: f.type }));
}

function approve(f: UIFlag): void {
  f.status = 'approved';
  if (!(f.target in mapping)) {
    mapping[f.target] = nextPlaceholder(f.type, mapping);
    sessionAdded.add(f.target);
    saveMapping();
  }
}

function unapprove(f: UIFlag): void {
  f.status = 'pending';
  const usedElsewhere = uiFlags.some((o) => o !== f && o.status === 'approved' && o.target === f.target);
  if (sessionAdded.has(f.target) && !usedElsewhere) {
    delete mapping[f.target];
    sessionAdded.delete(f.target);
    saveMapping();
  }
}

$('btn-approve-all').addEventListener('click', () => {
  for (const f of uiFlags) if (f.status === 'pending') approve(f);
  renderAll();
});

$('btn-flag-selection').addEventListener('click', () => {
  const sel = window.getSelection();
  const text = sel?.toString().trim() ?? '';
  if (text.length === 0 || !sel || !docview.contains(sel.anchorNode)) {
    scanStatus.textContent = 'Select text in the scanned document first, then press Flag selection.';
    return;
  }
  const start = docText.indexOf(text);
  uiFlags.push({
    id: nextId++,
    flag: {
      kind: 'name',
      category: 'manual',
      start: Math.max(0, start),
      end: Math.max(0, start) + text.length,
      text,
      reason: 'Added by you',
      placeholderType: 'student',
    },
    status: 'pending',
    target: text,
    type: 'student',
    fromMapping: false,
  });
  sel.removeAllRanges();
  renderAll();
});

// ---------- rendering ----------

function renderAll(): void {
  renderDocview();
  renderRail();
  renderOutput();
  renderMappingStrip();
  syncCardHeight();
}

/** Non-overlapping display spans: approved first, then direct > name > contextual. */
function displaySpans(): UIFlag[] {
  const priority = (f: UIFlag): number =>
    (f.status === 'approved' ? 0 : 4) +
    (f.flag.kind === 'direct' ? 0 : f.flag.kind === 'name' ? 1 : 2);
  const active = uiFlags.filter((f) => f.status !== 'dismissed' && f.flag.start >= 0);
  const chosen: UIFlag[] = [];
  for (const f of [...active].sort((a, b) => priority(a) - priority(b))) {
    if (!chosen.some((c) => f.flag.start < c.flag.end && c.flag.start < f.flag.end)) chosen.push(f);
  }
  return chosen.sort((a, b) => a.flag.start - b.flag.start);
}

function renderDocview(): void {
  docview.textContent = '';
  let pos = 0;
  for (const f of displaySpans()) {
    if (f.flag.start > pos) docview.append(docText.slice(pos, f.flag.start));
    const mark = document.createElement('mark');
    mark.className = `hl kind-${f.flag.kind}`;
    mark.dataset['flagId'] = String(f.id);
    if (f.status === 'approved') {
      mark.classList.add('approved');
      mark.textContent = mapping[f.target] ?? f.target;
      mark.title = `${f.flag.text} → ${mapping[f.target] ?? ''}`;
    } else {
      mark.textContent = docText.slice(f.flag.start, f.flag.end);
      mark.title = f.flag.reason;
    }
    docview.append(mark);
    pos = f.flag.end;
  }
  docview.append(docText.slice(pos));
}

function renderRail(): void {
  const visible = uiFlags.filter((f) => !f.fromMapping);
  const pending = visible.filter((f) => f.status === 'pending').length;
  flagCount.textContent =
    visible.length === 0 ? 'No flags' : `${pending} of ${visible.length} pending`;

  flagList.textContent = '';
  for (const f of uiFlags) {
    const li = document.createElement('li');
    li.className = `flag kind-${f.flag.kind}`;
    if (f.status === 'approved') li.classList.add('is-approved');
    if (f.status === 'dismissed') li.classList.add('is-dismissed');

    const top = document.createElement('div');
    top.className = 'flag-top';
    const glyph = document.createElement('span');
    glyph.className = 'glyph';
    glyph.setAttribute('aria-hidden', 'true');
    glyph.textContent = GLYPH[f.flag.kind];
    const text = document.createElement('span');
    text.className = 'flag-text';
    text.textContent = `“${f.target}”`;
    top.append(glyph, text);
    if (f.status === 'approved' && mapping[f.target] !== undefined) {
      const arrow = document.createElement('span');
      arrow.className = 'flag-arrow';
      arrow.textContent = `→ ${mapping[f.target]}`;
      top.append(arrow);
    }
    li.append(top);

    const reason = document.createElement('div');
    reason.className = 'flag-reason';
    reason.textContent = f.flag.reason;
    li.append(reason);

    const actions = document.createElement('div');
    actions.className = 'flag-actions';
    if (f.fromMapping) {
      // Managed via the mapping strip, not per-flag controls.
    } else if (f.status === 'pending') {
      const select = document.createElement('select');
      select.setAttribute('aria-label', 'Replacement type');
      for (const [value, label] of TYPE_OPTIONS) {
        const opt = document.createElement('option');
        opt.value = value;
        opt.textContent = label;
        opt.selected = value === f.type;
        select.append(opt);
      }
      select.addEventListener('change', () => {
        f.type = select.value as PlaceholderType;
      });
      actions.append(select);
      actions.append(
        makeButton('Approve', () => {
          approve(f);
          renderAll();
        }),
        makeButton('Edit', () => {
          edit.hidden = !edit.hidden;
          syncCardHeight();
        }),
        makeButton('Dismiss', () => {
          f.status = 'dismissed';
          renderAll();
        }),
      );
    } else if (f.status === 'approved') {
      actions.append(
        makeButton('Undo', () => {
          unapprove(f);
          renderAll();
        }),
      );
    } else {
      actions.append(
        makeButton('Restore', () => {
          f.status = 'pending';
          renderAll();
        }),
      );
    }
    li.append(actions);

    const edit = document.createElement('div');
    edit.className = 'flag-edit';
    edit.hidden = true;
    const input = document.createElement('input');
    input.value = f.target;
    input.setAttribute('aria-label', 'Exact text to replace');
    const save = makeButton('Save', () => {
      const v = input.value.trim();
      if (v.length > 0) f.target = v;
      edit.hidden = true;
      renderAll();
    });
    edit.append(input, save);
    li.append(edit);

    flagList.append(li);
  }
}

function makeButton(label: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}

function renderOutput(): void {
  // Approved targets are already in the mapping, so the exact-match pass
  // does all the work; pending and dismissed text stays untouched.
  const { masked } = maskText(docText, [], mapping);
  maskedOutput.textContent = masked;
  const pending = uiFlags.filter((f) => f.status === 'pending').length;
  pendingNote.textContent = pending > 0 ? `${pending} flag${pending === 1 ? '' : 's'} still pending review` : '';
}

// ---------- copy ----------

function wireCopy(buttonId: string, getText: () => string): void {
  const btn = $<HTMLButtonElement>(buttonId);
  const original = btn.textContent;
  btn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(getText());
      btn.textContent = 'Copied';
      setTimeout(() => {
        btn.textContent = original;
      }, 1400);
    } catch {
      btn.textContent = 'Copy failed — select and copy manually';
    }
  });
}
wireCopy('btn-copy-masked', () => maskedOutput.textContent ?? '');
wireCopy('btn-copy-unmasked', () => unmaskOutput.textContent ?? '');

// ---------- unmask flow ----------

$('btn-unmask').addEventListener('click', () => {
  const text = unmaskInput.value;
  if (text.trim().length === 0) {
    unmaskStatus.textContent = 'Paste AI output that contains placeholders.';
    unmaskResult.hidden = true;
    syncCardHeight();
    return;
  }
  const entries = Object.keys(mapping).length;
  if (entries === 0) {
    unmaskStatus.textContent = 'No mapping loaded — import the mapping file for this student first.';
    unmaskResult.hidden = true;
    syncCardHeight();
    return;
  }
  unmaskOutput.textContent = unmaskText(text, mapping);
  unmaskStatus.textContent = '';
  unmaskResult.hidden = false;
  syncCardHeight();
});

// ---------- mapping strip ----------

function renderMappingStrip(): void {
  const n = Object.keys(mapping).length;
  mappingCount.textContent =
    n === 0 ? 'No mapping yet.' : `Mapping: ${n} entr${n === 1 ? 'y' : 'ies'} on this device.`;
}

$('btn-export').addEventListener('click', () => {
  const studentReal = Object.entries(mapping).find(([, ph]) => ph === 'Student A')?.[0];
  const slug =
    studentReal
      ?.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'student';
  const blob = new Blob([serializeMapping(mapping)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${slug}.map.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});

$('btn-import').addEventListener('click', () => $<HTMLInputElement>('import-file').click());
$<HTMLInputElement>('import-file').addEventListener('change', async (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  try {
    const imported = parseMapping(await file.text());
    const merged: Mapping = { ...mapping, ...imported };
    parseMapping(serializeMapping(merged)); // re-validate: no ambiguous placeholders
    mapping = merged;
    saveMapping();
    renderMappingStrip();
    mappingCount.textContent += ' Imported.';
  } catch (err) {
    mappingCount.textContent = err instanceof Error ? err.message : 'Could not read that mapping file.';
  }
  (e.target as HTMLInputElement).value = '';
});

$('btn-clear').addEventListener('click', () => {
  const n = Object.keys(mapping).length;
  if (n > 0 && !confirm(`Clear all ${n} mapping entries from this device? Unmask will no longer work for existing masked documents unless you re-import the mapping file.`)) {
    return;
  }
  mapping = {};
  sessionAdded.clear();
  saveMapping();
  for (const f of uiFlags) if (f.status === 'approved' && !f.fromMapping) f.status = 'pending';
  uiFlags = uiFlags.filter((f) => !f.fromMapping);
  if (!review.hidden) renderAll();
  renderMappingStrip();
});

// ---------- boot ----------

setMode('mask');
renderMappingStrip();
window.addEventListener('resize', syncCardHeight);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {
      /* offline support is progressive; the tool works without it */
    });
  });
}
