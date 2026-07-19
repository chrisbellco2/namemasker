import {
  scanDocument,
  unmaskText,
  addToMap,
  applyMap,
  createStudentMap,
  liftV1,
  parseMapping,
  parseStudentMap,
  serializeStudentMap,
  type Flag,
  type KnownTerm,
  type PlaceholderType,
  type StudentMap,
} from '@namemasker/core';
import { extractTextFromFile } from './intake';
import { DOMINO_PEEK, DOMINO_SCAN, DOMINO_DONE } from './domino';

// ---------- state ----------

type FlagStatus = 'pending' | 'approved' | 'dismissed';

interface UIFlag {
  id: number;
  flag: Flag;
  status: FlagStatus;
  /** The exact string that will be replaced; editable. */
  target: string;
  type: PlaceholderType;
  /** True for exact matches of the loaded map (mapping or aliases). */
  fromMap: boolean;
}

const STORAGE_V1 = 'namemasker.mapping.v1';
const STORAGE_V2 = 'namemasker.map.v2';

let map: StudentMap = loadMap();
/** Reals added by approvals this session; safe to remove on undo. */
const sessionAdded = new Set<string>();
let uiFlags: UIFlag[] = [];
let docText = '';
let nextId = 1;

function loadMap(): StudentMap {
  try {
    const v2 = localStorage.getItem(STORAGE_V2);
    if (v2 !== null) return parseStudentMap(v2);
    const v1 = localStorage.getItem(STORAGE_V1);
    if (v1 !== null) {
      const lifted = liftV1(parseMapping(v1));
      localStorage.setItem(STORAGE_V2, serializeStudentMap(lifted));
      localStorage.removeItem(STORAGE_V1);
      return lifted;
    }
  } catch {
    /* fall through to a fresh map */
  }
  return createStudentMap();
}

function saveMap(): void {
  try {
    localStorage.setItem(STORAGE_V2, serializeStudentMap(map));
  } catch {
    /* private mode: session-only */
  }
}

function placeholderFor(real: string): string | undefined {
  return map.mapping[real] ?? map.aliases[real];
}

// ---------- dom ----------

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const docInput = $<HTMLTextAreaElement>('doc-input');
const scanStatus = $('scan-status');
const review = $('review');
const accumBanner = $('accum-banner');
const docview = $('docview');
const workbench = $('workbench');
const rail = $('rail');
const flagList = $<HTMLUListElement>('flag-list');
const summaryCounts = $('summary-counts');
const pendingNote = $('pending-note');
const unmaskInput = $<HTMLTextAreaElement>('unmask-input');
const unmaskOutput = $('unmask-output');
const unmaskResult = $('unmask-result');
const unmaskStatus = $('unmask-status');
const mappingCount = $('mapping-count');
const watchChips = $('watchlist-chips');
const watchInput = $<HTMLInputElement>('watchlist-input');
const popover = $('flag-popover');
const selChip = $<HTMLButtonElement>('sel-chip');

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

// ---------- Domino ----------

const dominoPeek = $('domino-peek');
const dominoScan = $('domino-scan');
dominoPeek.innerHTML = DOMINO_PEEK;
dominoScan.innerHTML = DOMINO_SCAN;

/** Peek over the empty paste box; duck away once a document is in play. */
function updateDominoPeek(): void {
  dominoPeek.hidden = !(docInput.value.trim().length === 0 && review.hidden);
}

/** Eyes covered while a scan runs: even the mascot doesn't look. */
function setDominoScanning(scanning: boolean): void {
  dominoScan.hidden = !scanning;
}
const KIND_LABEL: Record<Flag['kind'], string> = {
  direct: 'Direct identifier',
  name: 'Name',
  contextual: 'Contextual — your judgment',
};

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
  faceMask.toggleAttribute('hidden', false);
  faceUnmask.toggleAttribute('hidden', false);
  faceMask.setAttribute('aria-hidden', String(unmask));
  faceUnmask.setAttribute('aria-hidden', String(!unmask));
  faceMask.toggleAttribute('inert', unmask);
  faceUnmask.toggleAttribute('inert', !unmask);
  closePopover();
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

const MODEL_FAILED_MSG =
  'The name model could not load. Using the basic name pattern this session; it misses more than the model does.';

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
    modelStatus.textContent = MODEL_FAILED_MSG;
    if (queuedScan) runScan();
  } else if (msg.type === 'result' && msg.id === scanId) {
    finishScan(msg.failed === true ? undefined : nerSpansToFlags(msg.spans ?? []));
  }
};
nerWorker.onerror = () => {
  modelFailed = true;
  modelStatus.textContent = MODEL_FAILED_MSG;
  if (queuedScan) runScan();
};

// ---------- file intake ----------

/** Base filename of the last opened file, for naming the masked download. */
let docBaseName = 'document';

async function intakeFile(file: File): Promise<void> {
  scanStatus.textContent = `Reading ${file.name} on your device…`;
  try {
    const extracted = await extractTextFromFile(file);
    docInput.value = extracted.text;
    docBaseName = extracted.baseName;
    scanStatus.textContent = `Read ${file.name} (${extracted.text.length.toLocaleString()} characters). Nothing was uploaded. Press Mask when ready.`;
  } catch (err) {
    scanStatus.textContent = err instanceof Error ? err.message : 'Could not read that file.';
  }
  updateDominoPeek();
  syncCardHeight();
}

// Fictional sample documents. Same invented student across both, so
// masking Example 1 then Example 2 demonstrates the map carrying over.
const EXAMPLES: Array<{ base: string; text: string }> = [
  {
    base: 'example-letter',
    text: `Dear Admissions Committee,

It is my privilege to recommend Imani Okafor, the first female wrestling captain in the history of our small Quaker school outside Philadelphia. In my eleven years at Lakeside Prep, no student has balanced a state debate title with an award winning turn as oboe soloist in the Westfield Youth Symphony.

Imani's transcript speaks for itself, but the numbers miss her warmth. Ask anyone on the team she captained through an undefeated junior year.

Please reach me at d.alvarez@lakesideprep.org or (215) 555-0182 with any questions.

Sincerely,
Daniela Alvarez`,
  },
  {
    base: 'example-transcript',
    text: `Student Information
Student Name: Imani Okafor
Student Number: 884210  Grade: 11
Birthdate: 3/14/2008  Gender: F
#4471 Lakeside Preparatory School
Address: 128 Chestnut Hill Lane
Parent/Guardian: Robert Okafor  r.okafor@example.com

GPA Summary
Cumulative GPA (Weighted) 4.512
2023-2024  Grade 11  Term 1
AP Biology  A  5.0000  5
AP US History  A  5.0000  5
Honors Precalculus  A-  4.6700  5`,
  },
];

EXAMPLES.forEach((example, i) => {
  $(`btn-example-${i + 1}`).addEventListener('click', () => {
    docInput.value = example.text;
    docBaseName = example.base;
    scanStatus.textContent = 'Loaded a fictional sample document. Press Mask to see the review flow.';
    review.hidden = true;
    updateDominoPeek();
    syncCardHeight();
  });
});

$('btn-open-file').addEventListener('click', () => $<HTMLInputElement>('file-input').click());
$<HTMLInputElement>('file-input').addEventListener('change', (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) void intakeFile(file);
  (e.target as HTMLInputElement).value = '';
});
faceMask.addEventListener('dragover', (e) => {
  if (e.dataTransfer?.types.includes('Files')) {
    e.preventDefault();
    docInput.classList.add('dropping');
  }
});
faceMask.addEventListener('dragleave', (e) => {
  if (!faceMask.contains(e.relatedTarget as Node)) docInput.classList.remove('dropping');
});
faceMask.addEventListener('drop', (e) => {
  const file = e.dataTransfer?.files?.[0];
  if (file) {
    e.preventDefault();
    void intakeFile(file);
  }
  docInput.classList.remove('dropping');
});

/** True to proceed; warns when pending flags would leave text unmasked. */
function confirmPendingLeak(action: string): boolean {
  const pending = uiFlags.filter((f) => f.status === 'pending').length;
  if (pending === 0) return true;
  return confirm(
    `${pending} flag${pending === 1 ? ' is' : 's are'} still pending review and will NOT be masked. ${action} anyway?`,
  );
}

$('btn-download-masked').addEventListener('click', () => {
  if (!confirmPendingLeak('Download')) return;
  const blob = new Blob([renderedMaskedText()], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${docBaseName}.masked.txt`;
  a.click();
  URL.revokeObjectURL(a.href);
});

// ---------- masking flow ----------

function runScan(): void {
  queuedScan = false;
  if (modelFailed) {
    finishScan(undefined);
    return;
  }
  scanId++;
  setDominoScanning(true);
  scanStatus.textContent = 'Scanning on your device…';
  nerWorker.postMessage({ type: 'scan', id: scanId, text: docText });
}

$('btn-mask').addEventListener('click', () => {
  docText = docInput.value;
  if (docText.trim().length === 0) {
    scanStatus.textContent = 'Paste a document to begin.';
    review.hidden = true;
    updateDominoPeek();
    syncCardHeight();
    return;
  }
  if (!modelReady && !modelFailed) {
    queuedScan = true;
    setDominoScanning(true);
    scanStatus.textContent = 'Waiting for the on-device name model, then scanning…';
    return;
  }
  runScan();
});

/** undefined nameFlags = model unavailable; core falls back to the naive pattern. */
function finishScan(nameFlags: Flag[] | undefined): void {
  const mapped = new Set(Object.keys(map.mapping).concat(Object.keys(map.aliases)));
  const knownTerms: KnownTerm[] = map.watchlist
    .filter((t) => !mapped.has(t))
    .map((t) => ({ term: t }));
  const result = scanDocument(docText, {
    ...(nameFlags === undefined ? {} : { nameFlags }),
    knownTerms,
  });
  uiFlags = [];
  nextId = 1;

  // Loaded map first: exact matches of mapping and aliases arrive
  // pre-approved. This beats model misses and keeps placeholders stable.
  const covered: Array<{ start: number; end: number }> = [];
  const reals = [...mapped].sort((a, b) => b.length - a.length);
  for (const real of reals) {
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
              reason: map.aliases[real] !== undefined ? 'In your loaded map (alias)' : 'In your loaded map',
              placeholderType: 'other',
            },
            status: 'approved',
            target: real,
            type: 'other',
            fromMap: true,
          });
        }
      }
      idx = docText.indexOf(real, span.end);
    }
  }

  for (const flag of result.flags) {
    if (covered.some((c) => flag.start < c.end && c.start < flag.end)) continue;
    const ui: UIFlag = {
      id: nextId++,
      flag,
      status: 'pending',
      target: flag.text,
      type: flag.placeholderType,
      fromMap: false,
    };
    // Watchlist hits arrive pre-approved: the user asked for them by name.
    // Still individually dismissible on any document.
    if (flag.category === 'known-term') approve(ui);
    uiFlags.push(ui);
  }

  accumBanner.hidden = !result.accumulation.triggered;
  accumBanner.textContent = result.accumulation.message ?? '';

  const n = uiFlags.filter((f) => !f.fromMap).length;
  const matched = uiFlags.length - n;
  const matchedNote = matched > 0 ? ` ${matched} map entr${matched === 1 ? 'y' : 'ies'} matched.` : '';
  scanStatus.textContent =
    n === 0
      ? `No new flags. No patterns fired — that is not a guarantee of safety. Review the document yourself.${matchedNote}`
      : `${n} flag${n === 1 ? '' : 's'} staged for your review. Click any highlight to act on it.${matchedNote}`;

  review.hidden = false;
  setDominoScanning(false);
  updateDominoPeek();
  renderAll();
}

function approve(f: UIFlag): void {
  // A decision applies to the text, not one occurrence: every flag with the
  // same target moves together, matching the text-wide masking pass.
  for (const o of uiFlags) if (o.target === f.target && o.status === 'pending') o.status = 'approved';
  f.status = 'approved';
  if (placeholderFor(f.target) === undefined) {
    addToMap(map, { text: f.target, placeholderType: f.type });
    sessionAdded.add(f.target);
    saveMap();
  }
}

function unapprove(f: UIFlag): void {
  for (const o of uiFlags) {
    if (o.target === f.target && o.status === 'approved' && !o.fromMap) o.status = 'pending';
  }
  f.status = 'pending';
  if (sessionAdded.has(f.target)) {
    delete map.mapping[f.target];
    delete map.aliases[f.target];
    sessionAdded.delete(f.target);
    saveMap();
  }
}

function dismissTarget(f: UIFlag): void {
  for (const o of uiFlags) if (o.target === f.target && o.status !== 'dismissed') o.status = 'dismissed';
}

function restoreTarget(f: UIFlag): void {
  for (const o of uiFlags) {
    if (o.target !== f.target || o.status !== 'dismissed') continue;
    o.status = o.fromMap ? 'approved' : 'pending';
  }
}

$('btn-approve-all').addEventListener('click', () => {
  for (const f of uiFlags) if (f.status === 'pending') approve(f);
  renderAll();
});

$('btn-toggle-rail').addEventListener('click', () => {
  const off = rail.toggleAttribute('hidden');
  workbench.dataset['rail'] = off ? 'off' : 'on';
  $('btn-toggle-rail').textContent = off ? 'Details' : 'Hide details';
  syncCardHeight();
});

/** Stage a term the scan missed and mask it everywhere in the document. */
function maskTerm(term: string): boolean {
  const clean = term.trim();
  if (clean.length === 0) return false;
  const at = docText.indexOf(clean);
  if (at === -1) {
    scanStatus.textContent = `“${clean}” does not appear in the original document.`;
    return false;
  }
  let ui = uiFlags.find((f) => f.target === clean);
  if (ui === undefined) {
    ui = {
      id: nextId++,
      flag: {
        kind: 'name',
        category: 'manual',
        start: at,
        end: at + clean.length,
        text: clean,
        reason: 'Masked by you',
        placeholderType: 'student',
      },
      status: 'pending',
      target: clean,
      type: 'student',
      fromMap: false,
    };
    uiFlags.push(ui);
  }
  approve(ui);
  renderAll();
  return true;
}

// ---------- selection chip: "Mask this" in either pane ----------

function currentSelectionInPanes(): Selection | null {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
  const node = sel.anchorNode;
  if (node === null) return null;
  if (!docview.contains(node)) return null;
  return sel;
}

document.addEventListener('selectionchange', () => {
  const sel = currentSelectionInPanes();
  if (sel === null || sel.toString().trim().length === 0) {
    selChip.hidden = true;
    return;
  }
  const rect = sel.getRangeAt(0).getBoundingClientRect();
  selChip.hidden = false;
  selChip.style.top = `${rect.top + window.scrollY - 38}px`;
  selChip.style.left = `${Math.max(8, rect.left + window.scrollX + rect.width / 2 - selChip.offsetWidth / 2)}px`;
});

selChip.addEventListener('mousedown', (e) => e.preventDefault()); // keep the selection
selChip.addEventListener('click', () => {
  const sel = currentSelectionInPanes();
  const term = sel?.toString().trim() ?? '';
  selChip.hidden = true;
  sel?.removeAllRanges();
  if (term.length > 0) maskTerm(term);
});

// ---------- watchlist ----------

function renderWatchlist(): void {
  watchChips.textContent = '';
  for (const term of map.watchlist) {
    const chip = document.createElement('span');
    chip.className = 'watch-chip';
    const label = document.createElement('span');
    label.textContent = term;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'chip-x';
    remove.setAttribute('aria-label', `Stop always-flagging ${term}`);
    remove.textContent = '×';
    remove.addEventListener('click', () => {
      map.watchlist = map.watchlist.filter((t) => t !== term);
      saveMap();
      renderWatchlist();
      renderMappingStrip();
    });
    chip.append(label, remove);
    watchChips.append(chip);
  }
}

function addWatchTerm(): void {
  const term = watchInput.value.trim();
  if (term.length === 0) return;
  if (!map.watchlist.includes(term)) {
    map.watchlist.push(term);
    saveMap();
    renderWatchlist();
    renderMappingStrip();
  }
  watchInput.value = '';
}

$('btn-watch-add').addEventListener('click', addWatchTerm);
watchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    addWatchTerm();
  }
});

// ---------- rendering ----------

function renderAll(): void {
  closePopover();
  renderDocview();
  renderRail();
  renderSummary();
  renderMappingStrip();
  syncCardHeight();
}

function dismissedTargets(): Set<string> {
  return new Set(uiFlags.filter((f) => f.status === 'dismissed').map((f) => f.target));
}

function renderedMaskedText(): string {
  return applyMap(docText, map, dismissedTargets());
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

interface DocSpan {
  start: number;
  end: number;
  /** Set for map-derived chips: the real string this occurrence masks. */
  real?: string;
  /** Set for pending flag highlights. */
  ui?: UIFlag;
}

/**
 * The map is the truth the preview must match: every occurrence of every
 * active real renders as its placeholder chip, exactly mirroring applyMap
 * (longest real wins overlaps, whole-token matches, dismissed targets
 * excluded). Pending flags highlight on top of whatever text remains,
 * ranked direct > name > contextual so a direct hit is never visually
 * swallowed by a longer contextual passage.
 */
function renderDocview(): void {
  docview.textContent = '';
  const excluded = dismissedTargets();
  const spans: DocSpan[] = [];
  const overlapsAny = (s: number, e: number): boolean => spans.some((x) => s < x.end && x.start < e);

  const reals = [...Object.keys(map.mapping), ...Object.keys(map.aliases)]
    .filter((r) => !excluded.has(r))
    .sort((a, b) => b.length - a.length);
  for (const real of reals) {
    const re = new RegExp(`(?<!\\w)${escapeRegExp(real)}(?!\\w)`, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(docText)) !== null) {
      if (!overlapsAny(m.index, m.index + m[0].length)) {
        spans.push({ start: m.index, end: m.index + m[0].length, real });
      }
      if (m.index === re.lastIndex) re.lastIndex++;
    }
  }

  const kindRank = (f: UIFlag): number =>
    f.flag.kind === 'direct' ? 0 : f.flag.kind === 'name' ? 1 : 2;
  const pending = uiFlags
    .filter((f) => f.status === 'pending' && f.flag.start >= 0)
    .sort(
      (a, b) =>
        kindRank(a) - kindRank(b) || (b.flag.end - b.flag.start) - (a.flag.end - a.flag.start),
    );
  for (const f of pending) {
    if (!overlapsAny(f.flag.start, f.flag.end)) spans.push({ start: f.flag.start, end: f.flag.end, ui: f });
  }

  spans.sort((a, b) => a.start - b.start);
  let pos = 0;
  for (const s of spans) {
    if (s.start > pos) docview.append(docText.slice(pos, s.start));
    const mark = document.createElement('mark');
    mark.tabIndex = 0;
    mark.setAttribute('role', 'button');
    if (s.real !== undefined) {
      const ph = placeholderFor(s.real) ?? s.real;
      mark.className = 'hl kind-name approved';
      mark.dataset['real'] = s.real;
      mark.textContent = ph;
      mark.setAttribute('aria-label', `${s.real}, masked as ${ph}. Open options.`);
    } else if (s.ui !== undefined) {
      mark.className = `hl kind-${s.ui.flag.kind}`;
      mark.dataset['flagId'] = String(s.ui.id);
      mark.textContent = docText.slice(s.start, s.end);
      mark.setAttribute('aria-label', `${s.ui.flag.text}: ${s.ui.flag.reason}. Open options.`);
    }
    docview.append(mark);
    pos = s.end;
  }
  docview.append(docText.slice(pos));
}

function renderSummary(): void {
  const visible = uiFlags.filter((f) => !f.fromMap);
  const pending = uiFlags.filter((f) => f.status === 'pending').length;
  const byKind = (k: Flag['kind']): number => visible.filter((f) => f.flag.kind === k).length;
  summaryCounts.textContent = '';
  const parts: Array<[string, string, number]> = [
    ['direct', GLYPH.direct, byKind('direct')],
    ['name', GLYPH.name, byKind('name')],
    ['contextual', GLYPH.contextual, byKind('contextual')],
  ];
  for (const [kind, glyph, count] of parts) {
    const span = document.createElement('span');
    span.className = `count kind-${kind}`;
    span.textContent = `${glyph} ${count}`;
    summaryCounts.append(span);
  }
  const fromMap = uiFlags.filter((f) => f.fromMap).length;
  if (fromMap > 0) {
    const mapSpan = document.createElement('span');
    mapSpan.className = 'count-map';
    mapSpan.textContent = `${fromMap} from your map`;
    summaryCounts.append(mapSpan);
  }
  const pendingSpan = document.createElement('span');
  pendingSpan.className = 'count-pending';
  pendingSpan.textContent = pending === 0 ? 'all reviewed' : `${pending} pending`;
  summaryCounts.append(pendingSpan);
  if (pending === 0 && uiFlags.length > 0) {
    const done = document.createElement('span');
    done.className = 'domino-done';
    done.setAttribute('aria-hidden', 'true');
    done.innerHTML = DOMINO_DONE;
    summaryCounts.append(done);
  }

  const approveAll = $<HTMLButtonElement>('btn-approve-all');
  approveAll.disabled = pending === 0;
  approveAll.title = pending === 0 ? 'Nothing pending — every flag is already reviewed' : '';

  pendingNote.textContent = pending > 0 ? `${pending} flag${pending === 1 ? '' : 's'} still pending review` : '';
}

function renderRail(): void {
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
    const ph = placeholderFor(f.target);
    if (f.status === 'approved' && ph !== undefined) {
      const arrow = document.createElement('span');
      arrow.className = 'flag-arrow';
      arrow.textContent = `→ ${ph}`;
      top.append(arrow);
    }
    li.append(top);

    const reason = document.createElement('div');
    reason.className = 'flag-reason';
    reason.textContent = f.flag.reason;
    li.append(reason);

    const actions = document.createElement('div');
    actions.className = 'flag-actions';
    appendActions(actions, f, null);
    li.append(actions);
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

/** Shared action row for rail items and the popover. */
function appendActions(container: HTMLElement, f: UIFlag, editInput: HTMLInputElement | null): void {
  if (f.status === 'pending') {
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
    container.append(select);
    container.append(
      makeButton('Approve', () => {
        if (editInput !== null && editInput.value.trim().length > 0) f.target = editInput.value.trim();
        approve(f);
        renderAll();
      }),
      makeButton('Dismiss', () => {
        dismissTarget(f);
        renderAll();
      }),
    );
  } else if (f.status === 'approved') {
    container.append(
      makeButton(f.fromMap ? 'Skip in this document' : 'Undo', () => {
        if (f.fromMap) dismissTarget(f);
        else unapprove(f);
        renderAll();
      }),
    );
  } else {
    container.append(
      makeButton('Restore', () => {
        restoreTarget(f);
        renderAll();
      }),
    );
  }
}

// ---------- popover ----------

function closePopover(): void {
  popover.hidden = true;
}

function openPopover(f: UIFlag, anchor: DOMRect): void {
  popover.textContent = '';

  const head = document.createElement('div');
  head.className = `pop-kind kind-${f.flag.kind}`;
  head.textContent = `${GLYPH[f.flag.kind]} ${KIND_LABEL[f.flag.kind]}`;
  popover.append(head);

  const term = document.createElement('div');
  term.className = 'pop-term';
  const ph = placeholderFor(f.target);
  term.textContent = f.status === 'approved' && ph !== undefined ? `“${f.target}” → ${ph}` : `“${f.target}”`;
  popover.append(term);

  const reason = document.createElement('div');
  reason.className = 'pop-reason';
  reason.textContent = f.flag.reason;
  popover.append(reason);

  let editInput: HTMLInputElement | null = null;
  if (f.status === 'pending') {
    editInput = document.createElement('input');
    editInput.value = f.target;
    editInput.setAttribute('aria-label', 'Exact text to replace');
    editInput.className = 'pop-edit';
    popover.append(editInput);
  }

  const actions = document.createElement('div');
  actions.className = 'pop-actions';
  appendActions(actions, f, editInput);
  popover.append(actions);

  popover.hidden = false;
  const top = anchor.bottom + window.scrollY + 6;
  const left = Math.min(
    Math.max(8, anchor.left + window.scrollX),
    window.scrollX + document.documentElement.clientWidth - popover.offsetWidth - 8,
  );
  popover.style.top = `${top}px`;
  popover.style.left = `${left}px`;
  (popover.querySelector('button') as HTMLButtonElement | null)?.focus();
}

function flagFromEvent(e: Event): UIFlag | undefined {
  const mark = (e.target as HTMLElement).closest('mark[data-flag-id], mark[data-real]') as HTMLElement | null;
  if (mark === null) return undefined;
  const id = mark.dataset['flagId'];
  if (id !== undefined) return uiFlags.find((f) => f.id === Number(id));
  const real = mark.dataset['real'];
  if (real === undefined) return undefined;
  let ui = uiFlags.find((f) => f.target === real);
  if (ui === undefined) {
    // A map entry with no scan-time flag (e.g. imported mid-session);
    // synthesize one so the popover can act on it.
    const at = docText.indexOf(real);
    ui = {
      id: nextId++,
      flag: {
        kind: 'name',
        category: 'mapping',
        start: Math.max(0, at),
        end: Math.max(0, at) + real.length,
        text: real,
        reason: map.aliases[real] !== undefined ? 'In your loaded map (alias)' : 'In your loaded map',
        placeholderType: 'other',
      },
      status: 'approved',
      target: real,
      type: 'other',
      fromMap: true,
    };
    uiFlags.push(ui);
  }
  return ui;
}

docview.addEventListener('click', (e) => {
  const f = flagFromEvent(e);
  if (f === undefined) return;
  openPopover(f, (e.target as HTMLElement).getBoundingClientRect());
});
docview.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const f = flagFromEvent(e);
  if (f === undefined) return;
  e.preventDefault();
  openPopover(f, (e.target as HTMLElement).getBoundingClientRect());
});

document.addEventListener('mousedown', (e) => {
  if (popover.hidden) return;
  const t = e.target as Node;
  if (!popover.contains(t) && !(t instanceof HTMLElement && t.closest('mark[data-flag-id], mark[data-real]'))) {
    closePopover();
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closePopover();
});

// ---------- copy ----------

/** Fallback for when the async clipboard API rejects (e.g. focus quirks). */
function legacyCopy(text: string): boolean {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.append(ta);
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  ta.remove();
  return ok;
}

function wireCopy(buttonId: string, getText: () => string, guard?: () => boolean): void {
  const btn = $<HTMLButtonElement>(buttonId);
  const original = btn.textContent;
  const restore = (label: string, ms: number): void => {
    btn.textContent = label;
    setTimeout(() => {
      btn.textContent = original;
    }, ms);
  };
  btn.addEventListener('click', async () => {
    if (guard !== undefined && !guard()) return;
    const text = getText();
    try {
      await navigator.clipboard.writeText(text);
      restore('Copied', 1400);
    } catch {
      // Never fail silently: a stale clipboard here would paste the
      // original, unmasked document — the worst possible quiet failure.
      if (legacyCopy(text)) restore('Copied', 1400);
      else restore('Copy FAILED — nothing was copied. Select the text and copy manually.', 5000);
    }
  });
}
wireCopy('btn-copy-masked', () => renderedMaskedText(), () => confirmPendingLeak('Copy'));
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
  if (Object.keys(map.mapping).length === 0) {
    unmaskStatus.textContent = 'No map loaded — import the map file for this student first.';
    unmaskResult.hidden = true;
    syncCardHeight();
    return;
  }
  unmaskOutput.textContent = unmaskText(text, map.mapping);
  unmaskStatus.textContent = '';
  unmaskResult.hidden = false;
  syncCardHeight();
});

// ---------- map strip ----------

function renderMappingStrip(): void {
  const n = Object.keys(map.mapping).length;
  const a = Object.keys(map.aliases).length;
  const w = map.watchlist.length;
  if (n === 0 && a === 0 && w === 0) {
    mappingCount.textContent = 'No map yet.';
    return;
  }
  const parts = [`${n} mapped`];
  if (a > 0) parts.push(`${a} alias${a === 1 ? '' : 'es'}`);
  if (w > 0) parts.push(`${w} always-flag`);
  mappingCount.textContent = `Map: ${parts.join(', ')} — on this device.`;
}

$('btn-export').addEventListener('click', () => {
  const studentReal = Object.entries(map.mapping).find(([, ph]) => ph === 'Student A')?.[0];
  const slug =
    studentReal
      ?.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'student';
  const blob = new Blob([serializeStudentMap(map)], { type: 'application/json' });
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
    const imported = parseStudentMap(await file.text());
    const merged: StudentMap = {
      mapping: { ...map.mapping, ...imported.mapping },
      aliases: { ...map.aliases, ...imported.aliases },
      watchlist: [...new Set([...map.watchlist, ...imported.watchlist])],
    };
    parseStudentMap(serializeStudentMap(merged)); // re-validate the merge
    map = merged;
    saveMap();
    renderWatchlist();
    renderMappingStrip();
    mappingCount.textContent += ' Imported.';
  } catch (err) {
    mappingCount.textContent = err instanceof Error ? err.message : 'Could not read that map file.';
  }
  (e.target as HTMLInputElement).value = '';
});

$('btn-clear').addEventListener('click', () => {
  const n = Object.keys(map.mapping).length + Object.keys(map.aliases).length + map.watchlist.length;
  if (
    n > 0 &&
    !confirm(
      `Clear the whole map (${n} entries) from this device? Unmask will no longer work for existing masked documents unless you re-import the map file.`,
    )
  ) {
    return;
  }
  map = createStudentMap();
  sessionAdded.clear();
  saveMap();
  for (const f of uiFlags) if (f.status === 'approved' && !f.fromMap) f.status = 'pending';
  uiFlags = uiFlags.filter((f) => !f.fromMap);
  if (!review.hidden) renderAll();
  renderWatchlist();
  renderMappingStrip();
});

// ---------- boot ----------

setMode('mask');
renderWatchlist();
renderMappingStrip();
docInput.addEventListener('input', updateDominoPeek);
updateDominoPeek();
window.addEventListener('resize', syncCardHeight);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {
      /* offline support is progressive; the tool works without it */
    });
  });
}
