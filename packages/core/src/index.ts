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
} from './types';
export { DEFAULT_OPTIONS } from './types';

export { detectDirect } from './direct';
export { detectNamesNaive } from './names';
export { detectContextual, collectSignals } from './contextual';
export type { ContextualResult } from './contextual';
export { scanDocument } from './scan';

export { detectKnownTerms } from './scan';

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
} from './mapping';
export type { MaskResult } from './mapping';
