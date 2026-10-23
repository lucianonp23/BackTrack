import { describe, expect, it } from 'vitest';
import {
  addDays, currentStreak, dayKey, generateRound, isLetterMatch, isPositionMatch,
  longestStreak, nextLevel, scoreRound, trialsForLevel,
} from '../src/domain/engine';

function seeded(seed: number): () => number {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

describe('generateRound', () => {
  it('has 20+n trials with exactly 6 visual and 6 audio targets, 2 of them dual', () => {
    for (let n = 1; n <= 14; n++) {
      for (let s = 1; s <= 50; s++) {
        const r = generateRound(n, seeded(s * 97 + n));
        const total = trialsForLevel(n);
        expect(r.positions).toHaveLength(total);
        let v = 0, a = 0, both = 0;
        for (let i = 0; i < total; i++) {
          const pm = isPositionMatch(r, i), lm = isLetterMatch(r, i);
          if (pm) v++;
          if (lm) a++;
          if (pm && lm) both++;
        }
        expect([v, a, both]).toEqual([6, 6, 2]);
      }
    }
  });

  it('never uses the centre cell', () => {
    const r = generateRound(3, seeded(11));
    expect(r.positions).not.toContain(4);
  });
});

describe('scoreRound', () => {
  it('scores perfect answers 100 and no answers 0', () => {
    const r = generateRound(2, seeded(7));
    const pos = r.positions.map((_, i) => isPositionMatch(r, i));
    const let_ = r.letters.map((_, i) => isLetterMatch(r, i));
    const perfect = scoreRound(r, pos, let_);
    expect(perfect.visual.percent).toBe(100);
    expect(perfect.audio.percent).toBe(100);
    const none = scoreRound(r, [], []);
    expect(none.visual).toMatchObject({ percent: 0, misses: 6 });
  });

  it('penalises false alarms', () => {
    const r = generateRound(1, seeded(3));
    const s = scoreRound(r, r.positions.map(() => true), []);
    expect(s.visual.hits).toBe(6);
    expect(s.visual.falseAlarms).toBe(r.positions.length - 6);
    expect(s.visual.percent).toBeLessThan(75);
  });
});

describe('nextLevel', () => {
  it.each([
    [3, 90, 90, 4],
    [3, 100, 89, 3],
    [3, 75, 75, 3],
    [3, 74, 100, 2],
    [1, 0, 0, 1],
    [14, 100, 100, 14],
  ])('level %i with %i%%/%i%% → %i', (level, v, a, expected) => {
    expect(nextLevel(level, v, a)).toBe(expected);
  });
});

describe('days and streaks', () => {
  it('rolls the day over at 4 AM', () => {
    expect(dayKey(new Date(2026, 9, 22, 3, 59))).toBe('2026-10-21');
    expect(dayKey(new Date(2026, 9, 22, 4, 0))).toBe('2026-10-22');
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('counts current and longest streaks', () => {
    const days = ['2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21'];
    expect(currentStreak(days, '2026-10-22')).toBe(4);
    expect(currentStreak(days, '2026-10-21')).toBe(4);
    expect(currentStreak(days, '2026-10-23')).toBe(0);
    expect(longestStreak([...days, '2026-10-01', '2026-10-02'])).toBe(4);
  });
});
