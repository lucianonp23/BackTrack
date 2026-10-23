import type { KeyValueStore } from '../src/data/localStorageRepository';

/** In-memory stand-in for window.localStorage. */
export class MemoryStorage implements KeyValueStore {
  readonly data = new Map<string, string>();
  getItem(key: string): string | null { return this.data.get(key) ?? null; }
  setItem(key: string, value: string): void { this.data.set(key, value); }
  removeItem(key: string): void { this.data.delete(key); }
}

/** A round as the original JS app (schema v1) stored it. */
export const v1Round = (day: string, level: number, visual: number, audio: number, ts = Date.parse(`${day}T19:00:00`)) =>
  ({ ts, day, level, visual, audio, speed: 1 });
