// Pure game logic: no DOM, no storage.

import type { ChannelTally, DayKey, Letter, Position, RoundScore, RoundSequence } from './types';

export const LETTERS: readonly Letter[] = ['C', 'H', 'K', 'L', 'Q', 'R', 'S', 'T'];
// 3x3 grid indices, centre (4) excluded as in the Jaeggi et al. protocol.
export const POSITIONS: readonly Position[] = [0, 1, 2, 3, 5, 6, 7, 8];

export const MIN_LEVEL = 1;
export const MAX_LEVEL = 14;
export const ROUNDS_PER_SESSION = 12;
export const CHALLENGE_DAYS = 20;
export const LEVEL_UP_THRESHOLD = 90;
export const LEVEL_DOWN_THRESHOLD = 75;

// Scientific defaults: 3 s per trial, stimulus visible for 0.5 s.
export const BASE_TRIAL_MS = 3000;
export const BASE_STIMULUS_MS = 500;
export const MAX_SPEED = 4;

export type Random = () => number;

export const trialsForLevel = (n: number): number => 20 + n;

function shuffle<T>(arr: T[], rand: Random): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

const pick = <T>(options: readonly T[], rand: Random): T => options[Math.floor(rand() * options.length)]!;

function pickOther<T>(options: readonly T[], avoid: T, rand: Random): T {
  let v: T;
  do v = pick(options, rand);
  while (v === avoid);
  return v;
}

type TrialKind = 'none' | 'visual' | 'audio' | 'both';

/**
 * Build one round's stimulus sequence.
 * Per block: 4 visual-only, 4 auditory-only and 2 dual targets (6 per channel).
 * Non-target trials never accidentally match the item n steps back.
 */
export function generateRound(n: number, rand: Random = Math.random): RoundSequence {
  const total = trialsForLevel(n);
  const eligible = shuffle([...Array(total - n).keys()].map((i) => i + n), rand);
  const kind: TrialKind[] = new Array<TrialKind>(total).fill('none');
  eligible.slice(0, 2).forEach((i) => (kind[i] = 'both'));
  eligible.slice(2, 6).forEach((i) => (kind[i] = 'visual'));
  eligible.slice(6, 10).forEach((i) => (kind[i] = 'audio'));

  const positions: Position[] = [];
  const letters: Letter[] = [];
  for (let i = 0; i < total; i++) {
    if (i < n) {
      positions.push(pick(POSITIONS, rand));
      letters.push(pick(LETTERS, rand));
      continue;
    }
    const k = kind[i];
    const pMatch = k === 'visual' || k === 'both';
    const aMatch = k === 'audio' || k === 'both';
    const prevPos = positions[i - n]!;
    const prevLetter = letters[i - n]!;
    positions.push(pMatch ? prevPos : pickOther(POSITIONS, prevPos, rand));
    letters.push(aMatch ? prevLetter : pickOther(LETTERS, prevLetter, rand));
  }
  return { n, positions, letters };
}

export const isPositionMatch = (round: RoundSequence, i: number): boolean =>
  i >= round.n && round.positions[i] === round.positions[i - round.n];

export const isLetterMatch = (round: RoundSequence, i: number): boolean =>
  i >= round.n && round.letters[i] === round.letters[i - round.n];

/** Tally a channel: `responses[i]` is true when the player flagged trial i. */
export function scoreChannel(
  round: RoundSequence,
  responses: readonly boolean[],
  matchFn: (round: RoundSequence, i: number) => boolean,
): ChannelTally {
  let hits = 0, misses = 0, falseAlarms = 0;
  for (let i = 0; i < round.positions.length; i++) {
    const target = matchFn(round, i);
    const said = !!responses[i];
    if (target && said) hits++;
    else if (target) misses++;
    else if (said) falseAlarms++;
  }
  const denom = hits + misses + falseAlarms;
  const percent = denom === 0 ? 100 : Math.round((hits / denom) * 100);
  return { hits, misses, falseAlarms, percent };
}

export function scoreRound(
  round: RoundSequence,
  positionResponses: readonly boolean[],
  letterResponses: readonly boolean[],
): RoundScore {
  return {
    visual: scoreChannel(round, positionResponses, isPositionMatch),
    audio: scoreChannel(round, letterResponses, isLetterMatch),
  };
}

export const clampLevel = (level: number): number => Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, level));

/** Up if both >= 90 %, down if either < 75 %, else stay. Capped 1..14. */
export function nextLevel(level: number, visualPct: number, audioPct: number): number {
  if (visualPct >= LEVEL_UP_THRESHOLD && audioPct >= LEVEL_UP_THRESHOLD) return clampLevel(level + 1);
  if (visualPct < LEVEL_DOWN_THRESHOLD || audioPct < LEVEL_DOWN_THRESHOLD) return clampLevel(level - 1);
  return level;
}

/** Training days roll over at 4 AM local time, not midnight. */
export function dayKey(date: Date = new Date()): DayKey {
  const d = new Date(date.getTime() - 4 * 3600 * 1000);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function addDays(key: DayKey, delta: number): DayKey {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  const dt = new Date(y, m - 1, d + delta, 12);
  return dayKey(new Date(dt.getTime() + 4 * 3600 * 1000));
}

/** Consecutive completed days ending today (or yesterday, if today isn't done yet). */
export function currentStreak(completedDays: Iterable<DayKey>, today: DayKey = dayKey()): number {
  const set = new Set(completedDays);
  let cursor = set.has(today) ? today : addDays(today, -1);
  let streak = 0;
  while (set.has(cursor)) {
    streak++;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

export function longestStreak(completedDays: Iterable<DayKey>): number {
  const sorted = [...new Set(completedDays)].sort();
  let best = 0, run = 0;
  let prev: DayKey | null = null;
  for (const k of sorted) {
    run = prev && addDays(prev, 1) === k ? run + 1 : 1;
    best = Math.max(best, run);
    prev = k;
  }
  return best;
}

export function timingForSpeed(speed: number): { trialMs: number; stimulusMs: number } {
  const s = Math.min(MAX_SPEED, Math.max(1, speed));
  return { trialMs: BASE_TRIAL_MS / s, stimulusMs: BASE_STIMULUS_MS / s };
}
