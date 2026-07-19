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
const maskedOutput = $('masked-output');
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
  syncCardHeight();
}

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

$('btn-download-masked').addEventListener('click', () => {
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
  renderAll();
}

function approve(f: UIFlag): void {
  f.status = 'approved';
  if (placeholderFor(f.target) === undefined) {
    addToMap(map, { text: f.target, placeholderType: f.type });
    sessionAdded.add(f.target);
    saveMap();
  }
}

function unapprove(f: UIFlag): void {
  f.status = 'pending';
  const usedElsewhere = uiFlags.some((o) => o !== f && o.status === 'approved' && o.target === f.target);
  if (sessionAdded.has(f.target) && !usedElsewhere) {
    delete map.mapping[f.target];
    delete map.aliases[f.target];
    sessionAdded.delete(f.target);
    saveMap();
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
  if (!docview.contains(node) && !maskedOutput.contains(node)) return null;
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
  renderOutput();
  renderMappingStrip();
  syncCardHeight();
}

function dismissedTargets(): Set<string> {
  return new Set(uiFlags.filter((f) => f.status === 'dismissed').map((f) => f.target));
}

function renderedMaskedText(): string {
  return applyMap(docText, map, dismissedTargets());
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
    mark.tabIndex = 0;
    mark.setAttribute('role', 'button');
    if (f.status === 'approved') {
      mark.classList.add('approved');
      mark.textContent = placeholderFor(f.target) ?? f.target;
      mark.setAttribute('aria-label', `${f.flag.text}, masked as ${placeholderFor(f.target) ?? ''}. Open options.`);
    } else {
      mark.textContent = docText.slice(f.flag.start, f.flag.end);
      mark.setAttribute('aria-label', `${f.flag.text}: ${f.flag.reason}. Open options.`);
    }
    docview.append(mark);
    pos = f.flag.end;
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
  const pendingSpan = document.createElement('span');
  pendingSpan.className = 'count-pending';
  pendingSpan.textContent = pending === 0 ? 'all reviewed' : `${pending} pending`;
  summaryCounts.append(pendingSpan);

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
        f.status = 'dismissed';
        renderAll();
      }),
    );
  } else if (f.status === 'approved') {
    container.append(
      makeButton(f.fromMap ? 'Skip in this document' : 'Undo', () => {
        if (f.fromMap) f.status = 'dismissed';
        else unapprove(f);
        renderAll();
      }),
    );
  } else {
    container.append(
      makeButton('Restore', () => {
        f.status = f.fromMap ? 'approved' : 'pending';
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
  const mark = (e.target as HTMLElement).closest('mark[data-flag-id], button[data-real]');
  if (mark === null) return undefined;
  const id = (mark as HTMLElement).dataset['flagId'];
  if (id !== undefined) return uiFlags.find((f) => f.id === Number(id));
  const real = (mark as HTMLElement).dataset['real'];
  return uiFlags.find((f) => f.target === real);
}

for (const pane of [docview, maskedOutput]) {
  pane.addEventListener('click', (e) => {
    const f = flagFromEvent(e);
    if (f === undefined) return;
    openPopover(f, (e.target as HTMLElement).getBoundingClientRect());
  });
  pane.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key !== 'Enter' && (e as KeyboardEvent).key !== ' ') return;
    const f = flagFromEvent(e);
    if (f === undefined) return;
    e.preventDefault();
    openPopover(f, (e.target as HTMLElement).getBoundingClientRect());
  });
}

document.addEventListener('mousedown', (e) => {
  if (popover.hidden) return;
  const t = e.target as Node;
  if (!popover.contains(t) && !(t instanceof HTMLElement && t.closest('mark[data-flag-id], button[data-real]'))) {
    closePopover();
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closePopover();
});

// ---------- masked output ----------

function renderOutput(): void {
  const masked = renderedMaskedText();
  maskedOutput.textContent = '';
  const placeholders = [...new Set([...Object.values(map.mapping)])].sort((a, b) => b.length - a.length);
  if (placeholders.length === 0) {
    maskedOutput.textContent = masked;
    return;
  }
  const escaped = placeholders.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const re = new RegExp(`(?<!\\w)(?:${escaped.join('|')})(?!\\w)`, 'g');
  let pos = 0;
  let m: RegExpExecArray | null;
  const byPlaceholder = new Map<string, string>();
  for (const [real, p] of Object.entries(map.mapping)) byPlaceholder.set(p, real);
  while ((m = re.exec(masked)) !== null) {
    if (m.index > pos) maskedOutput.append(masked.slice(pos, m.index));
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'ph-chip';
    chip.textContent = m[0];
    const real = byPlaceholder.get(m[0]);
    if (real !== undefined) {
      chip.dataset['real'] = real;
      chip.title = `Masked: ${real}. Click for options.`;
    }
    maskedOutput.append(chip);
    pos = m.index + m[0].length;
  }
  maskedOutput.append(masked.slice(pos));
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
wireCopy('btn-copy-masked', () => renderedMaskedText());
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
window.addEventListener('resize', syncCardHeight);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {
      /* offline support is progressive; the tool works without it */
    });
  });
}
