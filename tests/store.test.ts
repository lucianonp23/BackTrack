import { describe, expect, it, vi } from 'vitest';
import { LEGACY_KEY, LocalStorageRepository, STORAGE_KEY } from '../src/data/localStorageRepository';
import { summarize } from '../src/domain/stats';
import type { RoundScore } from '../src/domain/types';
import { AppStore, effectiveSettings } from '../src/state/appStore';
import { MemoryStorage, v1Round } from './helpers';

const score = (v: number, a: number): RoundScore => ({
  visual: { hits: 0, misses: 0, falseAlarms: 0, percent: v },
  audio: { hits: 0, misses: 0, falseAlarms: 0, percent: a },
});

async function freshStore(storage = new MemoryStorage()) {
  return { storage, store: await AppStore.open(new LocalStorageRepository(storage)) };
}

describe('AppStore', () => {
  it('records rounds, applies levelling and persists across reloads', async () => {
    const { storage, store } = await freshStore();
    const at = new Date(2026, 9, 22, 19);
    await store.recordRound({ level: 1, score: score(95, 90), speed: 1, scientific: true, letterMode: 'speak' }, at);
    await store.recordRound({ level: 2, score: score(70, 95), speed: 1, scientific: true, letterMode: 'speak' }, at);

    expect(store.profile.level).toBe(1);
    expect(store.profile.challengeStart).toBe('2026-10-22');
    expect(store.rounds.map((r) => [r.level, r.nextLevel])).toEqual([[1, 2], [2, 1]]);

    const reopened = await AppStore.open(new LocalStorageRepository(storage));
    expect(reopened.snapshot).toEqual(store.snapshot);
  });

  it('records which letter mode each round was played in', async () => {
    const { storage, store } = await freshStore();
    await store.recordRound({ level: 1, score: score(80, 80), speed: 1, scientific: true, letterMode: 'show' });
    const reopened = await AppStore.open(new LocalStorageRepository(storage));
    expect(reopened.rounds[0]!.letterMode).toBe('show');
  });

  it('notifies subscribers on change', async () => {
    const { store } = await freshStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    await store.updateSettings({ showGrid: false });
    await store.setLevel(20);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(store.profile.level).toBe(14);
    unsubscribe();
    await store.setLevel(3);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('migrates data left by the original JS app on first load', async () => {
    const storage = new MemoryStorage();
    storage.setItem(LEGACY_KEY, JSON.stringify({ level: 2, rounds: [v1Round('2026-10-21', 1, 95, 95)], settings: {} }));
    const { store } = await freshStore(storage);

    expect(store.profile.level).toBe(2);
    expect(store.rounds).toHaveLength(1);
    expect(JSON.parse(storage.getItem(STORAGE_KEY)!).schemaVersion).toBe(2);
    expect(storage.getItem(LEGACY_KEY)).not.toBeNull();
  });

  it('imports an export and rejects garbage without losing data', async () => {
    const { store } = await freshStore();
    await store.recordRound({ level: 1, score: score(80, 80), speed: 1, scientific: true, letterMode: 'speak' });
    const exported = JSON.parse(JSON.stringify(store.exportData()));

    const { store: other } = await freshStore();
    await other.importData(exported);
    expect(other.rounds).toEqual(store.rounds);

    await expect(other.importData({ nope: true })).rejects.toThrow();
    expect(other.rounds).toHaveLength(1);
  });

  it('reset clears everything', async () => {
    const { storage, store } = await freshStore();
    await store.recordRound({ level: 1, score: score(100, 100), speed: 1, scientific: true, letterMode: 'speak' });
    await store.reset();
    expect(store.rounds).toHaveLength(0);
    expect(summarize(store.snapshot).level).toBe(1);
    expect(JSON.parse(storage.getItem(STORAGE_KEY)!).rounds).toEqual([]);
  });

  it('scientific mode locks speed, feedback and level controls', async () => {
    const { store } = await freshStore();
    await store.updateSettings({ speed: 3, instantFeedback: true, levelControls: true });
    expect(effectiveSettings(store.settings)).toMatchObject({ speed: 1, instantFeedback: false, levelControls: false });
    await store.updateSettings({ scientific: false });
    expect(effectiveSettings(store.settings)).toMatchObject({ speed: 3, instantFeedback: true, levelControls: true });
  });
});

describe('LocalStorageRepository', () => {
  it('ignores a duplicate round id (idempotent appends, ready for sync)', async () => {
    const repo = new LocalStorageRepository(new MemoryStorage());
    const snap = await repo.load();
    const { store } = await freshStore();
    const round = await store.recordRound({ level: 1, score: score(80, 80), speed: 1, scientific: true, letterMode: 'speak' });
    await repo.appendRound(round);
    await repo.appendRound(round);
    expect((await repo.load()).rounds).toHaveLength(snap.rounds.length + 1);
  });

  it('keeps working in memory when storage is unavailable', async () => {
    const store = await AppStore.open(new LocalStorageRepository(null));
    await store.recordRound({ level: 1, score: score(95, 95), speed: 1, scientific: true, letterMode: 'speak' });
    expect(store.profile.level).toBe(2);
  });
});
