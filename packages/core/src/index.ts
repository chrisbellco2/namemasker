/**
 * @namemasker/core — local PII detection, masking, and restore.
 *
 * Everything here runs entirely on the caller's device, browser or Node.
 * No function in this library performs any network request, ever.
 *
 * Detection layers are exported independently; scanDocument composes them.
 * The tool stages, the professional approves: nothing in this library
 * auto-redacts a contextual flag or claims a document is "safe."
 */

export type {
  FlagKind,
  PlaceholderType,
  Flag,
  ContextSignal,
  ScanOptions,
  AccumulationResult,
  ScanResult,
  Mapping,
  StudentMap,
  KnownTerm,
  ApprovedItem,
} from './types.js';
export { DEFAULT_OPTIONS } from './types.js';

export { detectDirect } from './direct.js';
export { detectNamesNaive } from './names.js';
export { detectContextual, collectSignals } from './contextual.js';
export type { ContextualResult } from './contextual.js';
export { scanDocument } from './scan.js';

export { detectKnownTerms } from './scan.js';

export {
  nextPlaceholder,
  maskText,
  unmaskText,
  serializeMapping,
  parseMapping,
  MAP_FORMAT,
  createStudentMap,
  liftV1,
  addToMap,
  applyMap,
  serializeStudentMap,
  parseStudentMap,
} from './mapping.js';
export type { MaskResult } from './mapping.js';
