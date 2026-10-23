import type { Profile, ProgressSnapshot, Round, Settings } from '../domain/types';
import type { ProgressRepository } from './repository';
import { emptySnapshot, parseSnapshot } from './schema';

/** The subset of the Web Storage API we use; injectable for tests. */
export type KeyValueStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export const STORAGE_KEY = 'backtrack.v2';
/** Written by the original JS app. Read once for migration and left in place as a fallback. */
export const LEGACY_KEY = 'backtrack.v1';

/** Device-only persistence. Keeps the whole snapshot in memory and writes it back on every change. */
export class LocalStorageRepository implements ProgressRepository {
  private snapshot: ProgressSnapshot | null = null;

  constructor(private readonly storage: KeyValueStore | null = safeLocalStorage()) {}

  async load(): Promise<ProgressSnapshot> {
    this.snapshot = this.readFrom(STORAGE_KEY) ?? this.readFrom(LEGACY_KEY) ?? emptySnapshot();
    this.write();
    return structuredClone(this.snapshot);
  }

  async appendRound(round: Round): Promise<void> {
    const s = this.current();
    if (!s.rounds.some((r) => r.id === round.id)) s.rounds.push(round);
    this.write();
  }

  async saveProfile(profile: Profile): Promise<void> {
    this.current().profile = profile;
    this.write();
  }

  async saveSettings(settings: Settings): Promise<void> {
    this.current().settings = settings;
    this.write();
  }

  async replace(snapshot: ProgressSnapshot): Promise<void> {
    this.snapshot = structuredClone(snapshot);
    this.write();
  }

  async clear(): Promise<void> {
    this.snapshot = emptySnapshot();
    try {
      this.storage?.removeItem(STORAGE_KEY);
      this.storage?.removeItem(LEGACY_KEY);
    } catch { /* storage blocked */ }
    this.write();
  }

  private current(): ProgressSnapshot {
    if (!this.snapshot) throw new Error('LocalStorageRepository used before load()');
    return this.snapshot;
  }

  private readFrom(key: string): ProgressSnapshot | null {
    try {
      const raw = this.storage?.getItem(key);
      return raw ? parseSnapshot(JSON.parse(raw)) : null;
    } catch (err) {
      console.warn(`Ignoring unreadable data in ${key}`, err);
      return null;
    }
  }

  private write(): void {
    try {
      this.storage?.setItem(STORAGE_KEY, JSON.stringify(this.snapshot));
    } catch (err) {
      // Private mode or quota exceeded: keep working in memory for this session.
      console.warn('Could not persist progress', err);
    }
  }
}

function safeLocalStorage(): KeyValueStore | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
