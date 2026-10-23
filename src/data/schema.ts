// Snapshot defaults, validation and versioned migrations.
// Bump SCHEMA_VERSION and add a step to `migrate` whenever the stored shape changes.

import { clampLevel } from '../domain/engine';
import { LETTER_MODES } from '../domain/types';
import type { ChannelScore, LetterMode, Profile, ProgressSnapshot, Round, Settings, Theme, VoiceLang } from '../domain/types';
import { newId } from './ids';

export const SCHEMA_VERSION = 2;

const now = (): string => new Date().toISOString();

export function defaultSettings(): Settings {
  return {
    theme: 'system',
    letterMode: 'speak',
    showGrid: true,
    swapButtons: false,
    deselection: true,
    haptics: true,
    voiceLang: 'en',
    voiceURI: null,
    scientific: true,
    instantFeedback: false,
    levelControls: false,
    speed: 1,
    updatedAt: now(),
  };
}

export function emptySnapshot(): ProgressSnapshot {
  return {
    schemaVersion: SCHEMA_VERSION,
    profile: { level: 1, challengeStart: null, tutorialSeen: false, updatedAt: now() },
    settings: defaultSettings(),
    rounds: [],
  };
}

export class SnapshotError extends Error {}

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback);
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);

const readLetterMode = (v: unknown, fallback: LetterMode): LetterMode =>
  LETTER_MODES.find((m) => m === v) ?? fallback;

function readSettings(raw: unknown): Settings {
  const d = defaultSettings();
  if (!isObject(raw)) return d;
  const lang = raw['voiceLang'];
  const theme = raw['theme'];
  return {
    theme: (theme === 'light' || theme === 'dark' || theme === 'system' ? theme : d.theme) satisfies Theme,
    letterMode: readLetterMode(raw['letterMode'], d.letterMode),
    showGrid: bool(raw['showGrid'], d.showGrid),
    swapButtons: bool(raw['swapButtons'], d.swapButtons),
    deselection: bool(raw['deselection'], d.deselection),
    haptics: bool(raw['haptics'], d.haptics),
    voiceLang: (lang === 'en' || lang === 'pt' ? lang : d.voiceLang) satisfies VoiceLang,
    voiceURI: str(raw['voiceURI']),
    scientific: bool(raw['scientific'], d.scientific),
    instantFeedback: bool(raw['instantFeedback'], d.instantFeedback),
    levelControls: bool(raw['levelControls'], d.levelControls),
    speed: Math.min(4, Math.max(1, num(raw['speed'], d.speed))),
    updatedAt: str(raw['updatedAt']) ?? d.updatedAt,
  };
}

function readChannel(raw: unknown): ChannelScore {
  if (!isObject(raw)) throw new SnapshotError('Round is missing a channel score');
  const count = (v: unknown) => (typeof v === 'number' ? v : null);
  return {
    hits: count(raw['hits']),
    misses: count(raw['misses']),
    falseAlarms: count(raw['falseAlarms']),
    percent: num(raw['percent'], 0),
  };
}

function readRoundV2(raw: unknown): Round {
  if (!isObject(raw)) throw new SnapshotError('Round is not an object');
  const id = str(raw['id']);
  const day = str(raw['day']);
  const createdAt = str(raw['createdAt']);
  if (!id || !day || !createdAt) throw new SnapshotError('Round is missing id, day or createdAt');
  const level = clampLevel(num(raw['level'], 1));
  return {
    id, day, createdAt, level,
    nextLevel: clampLevel(num(raw['nextLevel'], level)),
    speed: num(raw['speed'], 1),
    scientific: bool(raw['scientific'], true),
    // Rounds stored before letter modes existed were always spoken.
    letterMode: readLetterMode(raw['letterMode'], 'speak'),
    visual: readChannel(raw['visual']),
    audio: readChannel(raw['audio']),
  };
}

function readV2(raw: Json): ProgressSnapshot {
  const p = isObject(raw['profile']) ? raw['profile'] : {};
  const profile: Profile = {
    level: clampLevel(num(p['level'], 1)),
    challengeStart: str(p['challengeStart']),
    tutorialSeen: bool(p['tutorialSeen'], false),
    updatedAt: str(p['updatedAt']) ?? now(),
  };
  const rounds = Array.isArray(raw['rounds']) ? raw['rounds'].map(readRoundV2) : [];
  return { schemaVersion: SCHEMA_VERSION, profile, settings: readSettings(raw['settings']), rounds };
}

/**
 * v1 (the original JS app): flat object, rounds stored only percentages and a
 * millisecond timestamp, no ids. Hit/miss counts weren't kept, so they migrate
 * as null rather than being invented.
 */
function migrateV1(raw: Json): Json {
  const rounds = Array.isArray(raw['rounds']) ? raw['rounds'].filter(isObject) : [];
  const level = clampLevel(num(raw['level'], 1));
  const migrated = rounds.map((r, i) => {
    const pct = (v: unknown) => ({ hits: null, misses: null, falseAlarms: null, percent: num(v, 0) });
    const following = rounds[i + 1];
    const speed = num(r['speed'], 1);
    return {
      id: newId(),
      createdAt: new Date(num(r['ts'], Date.now())).toISOString(),
      day: str(r['day']) ?? '1970-01-01',
      level: num(r['level'], 1),
      // v1 didn't store the outcome; the next round's level (or the current
      // level, for the last round) is what the player actually moved to.
      nextLevel: following ? num(following['level'], level) : level,
      speed,
      scientific: speed === 1,
      visual: pct(r['visual']),
      audio: pct(r['audio']),
    };
  });
  return {
    schemaVersion: 2,
    profile: {
      level,
      challengeStart: str(raw['challengeStart']),
      tutorialSeen: bool(raw['tutorialSeen'], false),
    },
    settings: raw['settings'],
    rounds: migrated,
  };
}

/** Validate unknown JSON (storage or an import file) and bring it to the current schema. */
export function parseSnapshot(data: unknown): ProgressSnapshot {
  if (!isObject(data) || !Array.isArray(data['rounds'])) throw new SnapshotError('Not a Backtrack data file');
  let raw: Json = data;
  const version = num(raw['schemaVersion'], 1);
  if (version > SCHEMA_VERSION) throw new SnapshotError(`Data is from a newer app version (schema ${version})`);
  if (version < 2) raw = migrateV1(raw);
  return readV2(raw);
}
