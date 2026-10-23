// Statistics derived from the round log. Nothing here is persisted: it is all
// recomputed from rounds, so it never needs syncing.

import { CHALLENGE_DAYS, ROUNDS_PER_SESSION, currentStreak, dayKey, longestStreak } from './engine';
import type { DayKey, ProgressSnapshot, Round } from './types';

export const avg = (xs: readonly number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export function roundsByDay(rounds: readonly Round[]): Map<DayKey, Round[]> {
  const map = new Map<DayKey, Round[]>();
  for (const r of rounds) {
    const list = map.get(r.day);
    if (list) list.push(r);
    else map.set(r.day, [r]);
  }
  return map;
}

export function completedDays(rounds: readonly Round[]): DayKey[] {
  return [...roundsByDay(rounds)].filter(([, rs]) => rs.length >= ROUNDS_PER_SESSION).map(([d]) => d);
}

export const roundsOnDay = (rounds: readonly Round[], day: DayKey = dayKey()): Round[] =>
  rounds.filter((r) => r.day === day);

export function challengeProgress(snapshot: ProgressSnapshot): number {
  const start = snapshot.profile.challengeStart;
  if (!start) return 0;
  return Math.min(CHALLENGE_DAYS, completedDays(snapshot.rounds).filter((d) => d >= start).length);
}

export interface Summary {
  level: number;
  maxLevel: number;
  currentStreak: number;
  longestStreak: number;
  sessions: number;
  rounds: number;
  averageLevel: number;
  challenge: number;
}

export function summarize(snapshot: ProgressSnapshot, today: DayKey = dayKey()): Summary {
  const { rounds, profile } = snapshot;
  const days = completedDays(rounds);
  return {
    level: profile.level,
    maxLevel: Math.max(profile.level, ...rounds.map((r) => r.level)),
    currentStreak: currentStreak(days, today),
    longestStreak: longestStreak(days),
    sessions: days.length,
    rounds: rounds.length,
    averageLevel: avg(rounds.map((r) => r.level)),
    challenge: challengeProgress(snapshot),
  };
}

export interface SessionSummary {
  averageLevel: number;
  maxLevel: number;
  averageVisual: number;
  averageAudio: number;
}

export function summarizeDay(rounds: readonly Round[]): SessionSummary {
  return {
    averageLevel: avg(rounds.map((r) => r.level)),
    maxLevel: Math.max(0, ...rounds.map((r) => r.level)),
    averageVisual: avg(rounds.map((r) => r.visual.percent)),
    averageAudio: avg(rounds.map((r) => r.audio.percent)),
  };
}
