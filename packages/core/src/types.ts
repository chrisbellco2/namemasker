/** The three flag kinds shown in the UI: red / name-colored / yellow. */
export type FlagKind = 'direct' | 'name' | 'contextual';

/** Placeholder sequences are assigned per type, in detection order. */
export type PlaceholderType =
  | 'student'
  | 'parent'
  | 'school'
  | 'coach'
  | 'org'
  | 'place'
  | 'email'
  | 'phone'
  | 'id'
  | 'date'
  | 'address'
  | 'other';

/** A single staged detection. Every flag carries a human-readable reason. */
export interface Flag {
  kind: FlagKind;
  /** Rule identifier, e.g. 'email', 'name-pair', 'school-list-continuation'. */
  category: string;
  start: number;
  end: number;
  text: string;
  reason: string;
  /** Suggested placeholder sequence if the professional approves this flag. */
  placeholderType: PlaceholderType;
  /** Contextual flags only: the score that crossed the threshold. */
  score?: number;
}

/** A raw contextual rule hit, before proximity scoring. */
export interface ContextSignal {
  category: string;
  weight: number;
  start: number;
  end: number;
  text: string;
}

export interface ScanOptions {
  /** Contextual score a signal must reach to become a flag. Default 3. */
  flagThreshold?: number;
  /** Contextual flag count that triggers the document-level banner. Default 6. */
  accumulationThreshold?: number;
  /** Distance (chars) within which neighboring signals contribute. Default 200. */
  proximityWindow?: number;
  /**
   * Name-kind flags from an external detector (e.g. an on-device NER model).
   * When provided, these replace the built-in naive capitalized-pair layer.
   */
  nameFlags?: Flag[];
  /**
   * Terms the caller already knows are identifying (the user's watchlist, or
   * a student record on the caller's side). Staged with top priority; they
   * win every overlap with detected flags.
   */
  knownTerms?: KnownTerm[];
}

export interface AccumulationResult {
  triggered: boolean;
  contextualCount: number;
  /** Present when triggered. A flag for the professional, never a redaction. */
  message?: string;
}

export interface ScanResult {
  flags: Flag[];
  accumulation: AccumulationResult;
}

/** Flat mapping: real string -> placeholder. The only sensitive artifact. */
export type Mapping = Record<string, string>;

/**
 * Map format v2 (namemasker-map@2): the full sensitive artifact.
 * - mapping: canonical real -> placeholder, placeholders unique. Unmask
 *   restores ONLY these, so restoration is always deterministic.
 * - aliases: alternate spellings -> an existing placeholder. They mask but
 *   never win at unmask ("Maya" -> "Student A" alongside "Maya Chen").
 * - watchlist: terms to always stage on scan. Deleting one only affects
 *   future scans; deleting a mapping entry is the only destructive act.
 */
export interface StudentMap {
  mapping: Mapping;
  aliases: Mapping;
  watchlist: string[];
}

/** A term the caller already knows is identifying (watchlist, student record). */
export interface KnownTerm {
  term: string;
  placeholderType?: PlaceholderType;
  /** Optional reason override shown on the flag. */
  label?: string;
}

/** A flag the professional approved, possibly with an edited replacement type. */
export interface ApprovedItem {
  text: string;
  placeholderType: PlaceholderType;
}

export const DEFAULT_OPTIONS: Required<Omit<ScanOptions, 'nameFlags' | 'knownTerms'>> = {
  flagThreshold: 3,
  accumulationThreshold: 6,
  proximityWindow: 200,
};
