import { describe, expect, it } from 'vitest';
import { SCHEMA_VERSION, SnapshotError, emptySnapshot, parseSnapshot } from '../src/data/schema';
import { v1Round } from './helpers';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('parseSnapshot', () => {
  it('migrates a v1 export from the original JS app', () => {
    const v1 = {
      level: 3,
      tutorialSeen: true,
      challengeStart: '2026-10-20',
      settings: { scientific: false, speed: 2, voiceLang: 'pt', instantFeedback: true },
      rounds: [v1Round('2026-10-20', 1, 95, 92), v1Round('2026-10-20', 2, 91, 90), v1Round('2026-10-21', 3, 60, 80)],
    };
    const s = parseSnapshot(v1);

    expect(s.schemaVersion).toBe(SCHEMA_VERSION);
    expect(s.profile).toMatchObject({ level: 3, tutorialSeen: true, challengeStart: '2026-10-20' });
    expect(s.settings).toMatchObject({ scientific: false, speed: 2, voiceLang: 'pt', instantFeedback: true, showGrid: true });
    expect(s.rounds).toHaveLength(3);
    for (const r of s.rounds) expect(r.id).toMatch(UUID);
    expect(new Set(s.rounds.map((r) => r.id)).size).toBe(3);
    // Outcome is reconstructed from the following round; the last uses the profile level.
    expect(s.rounds.map((r) => [r.level, r.nextLevel])).toEqual([[1, 2], [2, 3], [3, 3]]);
    // v1 never stored counts, so they must not be invented.
    expect(s.rounds[0]!.visual).toEqual({ hits: null, misses: null, falseAlarms: null, percent: 95 });
    expect(s.rounds[0]!.createdAt).toBe(new Date(v1.rounds[0]!.ts).toISOString());
  });

  it('round-trips a current snapshot unchanged', () => {
    const s = emptySnapshot();
    s.rounds.push({
      id: '6f1c2b1e-1d2a-4c3b-9a8e-1234567890ab', createdAt: '2026-10-22T19:00:00.000Z', day: '2026-10-22',
      level: 2, nextLevel: 3, speed: 1, scientific: true, letterMode: 'both',
      visual: { hits: 6, misses: 0, falseAlarms: 0, percent: 100 },
      audio: { hits: 5, misses: 1, falseAlarms: 0, percent: 83 },
    });
    expect(parseSnapshot(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });

  it('fills in settings added after the data was written', () => {
    const s = parseSnapshot({ schemaVersion: 2, profile: {}, settings: { speed: 9 }, rounds: [] });
    expect(s.settings.speed).toBe(4);
    expect(s.settings.voiceLang).toBe('en');
    expect(s.settings.theme).toBe('system');
    expect(s.profile.level).toBe(1);
  });

  it('defaults letter mode to spoken, for settings and for rounds stored before it existed', () => {
    const s = parseSnapshot({
      schemaVersion: 2,
      settings: { letterMode: 'shout' },
      rounds: [{ id: 'a', day: '2026-10-22', createdAt: '2026-10-22T19:00:00Z', visual: { percent: 90 }, audio: { percent: 90 } }],
    });
    expect(s.settings.letterMode).toBe('speak');
    expect(s.rounds[0]!.letterMode).toBe('speak');
    expect(parseSnapshot({ schemaVersion: 2, settings: { letterMode: 'show' }, rounds: [] }).settings.letterMode).toBe('show');
  });

  it('keeps a valid theme and rejects unknown ones', () => {
    const read = (theme: unknown) => parseSnapshot({ schemaVersion: 2, settings: { theme }, rounds: [] }).settings.theme;
    expect(read('dark')).toBe('dark');
    expect(read('light')).toBe('light');
    expect(read('purple')).toBe('system');
  });

  it.each([
    ['not an object', 'hello'],
    ['no rounds', { level: 2 }],
    ['newer schema', { schemaVersion: 99, rounds: [] }],
    ['round without id', { schemaVersion: 2, rounds: [{ day: '2026-10-22', createdAt: 'x' }] }],
  ])('rejects %s', (_, input) => {
    expect(() => parseSnapshot(input)).toThrow(SnapshotError);
  });
});
