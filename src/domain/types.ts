// Core domain types. Kept free of DOM and storage concerns so they can be
// shared with a future backend (e.g. as the API contract for round uploads).

export type Letter = 'C' | 'H' | 'K' | 'L' | 'Q' | 'R' | 'S' | 'T';
/** Cell index on the 3×3 grid, 0–8, row-major. The centre (4) is never used. */
export type Position = 0 | 1 | 2 | 3 | 5 | 6 | 7 | 8;
/** Calendar day in the user's local time, rolled over at 4 AM: `YYYY-MM-DD`. */
export type DayKey = string;
/** ISO-8601 timestamp. */
export type IsoDate = string;

export type Channel = 'visual' | 'audio';

export interface RoundSequence {
  n: number;
  positions: Position[];
  letters: Letter[];
}

export interface ChannelTally {
  hits: number;
  misses: number;
  falseAlarms: number;
  /** hits ÷ (hits + misses + false alarms), 0–100. */
  percent: number;
}

/** As stored: counts are null for rounds migrated from schema v1, which kept only percentages. */
export interface ChannelScore {
  hits: number | null;
  misses: number | null;
  falseAlarms: number | null;
  percent: number;
}

export interface RoundScore {
  visual: ChannelTally;
  audio: ChannelTally;
}

/**
 * One completed round. Immutable once created: rounds are only ever appended,
 * which makes syncing idempotent (the client-generated `id` dedupes uploads).
 */
export interface Round {
  id: string;
  createdAt: IsoDate;
  day: DayKey;
  /** Level the round was played at. */
  level: number;
  /** Level the levelling rule produced. A manual override changes the profile, not this. */
  nextLevel: number;
  speed: number;
  scientific: boolean;
  /** Silent ('show') rounds are a different task from spoken ones; kept so stats can tell them apart. */
  letterMode: LetterMode;
  visual: ChannelScore;
  audio: ChannelScore;
}

export type VoiceLang = 'en' | 'pt';
export type Theme = 'system' | 'light' | 'dark';
/** How each letter is presented: spoken aloud, spoken and written in the square, or written only (silent). */
export type LetterMode = 'speak' | 'both' | 'show';
export const LETTER_MODES: readonly LetterMode[] = ['speak', 'both', 'show'];

export interface Settings {
  theme: Theme;
  letterMode: LetterMode;
  showGrid: boolean;
  swapButtons: boolean;
  deselection: boolean;
  haptics: boolean;
  voiceLang: VoiceLang;
  voiceURI: string | null;
  scientific: boolean;
  instantFeedback: boolean;
  levelControls: boolean;
  speed: number;
  /** Last-write-wins marker for future cross-device sync. */
  updatedAt: IsoDate;
}

export interface Profile {
  level: number;
  challengeStart: DayKey | null;
  tutorialSeen: boolean;
  updatedAt: IsoDate;
}

/** Everything persisted for one user. */
export interface ProgressSnapshot {
  schemaVersion: number;
  profile: Profile;
  settings: Settings;
  rounds: Round[];
}
