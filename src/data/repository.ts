import type { Profile, ProgressSnapshot, Round, Settings } from '../domain/types';

/**
 * Persistence boundary for a user's progress. The app only talks to this
 * interface, so storage can change without touching UI or game code:
 *
 *   today:  LocalStorageRepository (device only)
 *   later:  IndexedDbRepository, or a SyncedRepository that writes locally
 *           first and uploads in the background (rounds are append-only with
 *           client-generated ids, so uploads are idempotent; profile and
 *           settings carry `updatedAt` for last-write-wins).
 *
 * Methods are async even though localStorage is sync, so a network- or
 * IndexedDB-backed implementation can drop in without changing callers.
 */
export interface ProgressRepository {
  load(): Promise<ProgressSnapshot>;
  appendRound(round: Round): Promise<void>;
  saveProfile(profile: Profile): Promise<void>;
  saveSettings(settings: Settings): Promise<void>;
  /** Replace everything, e.g. after an import. */
  replace(snapshot: ProgressSnapshot): Promise<void>;
  clear(): Promise<void>;
}
