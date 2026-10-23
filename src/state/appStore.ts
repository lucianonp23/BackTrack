// Single source of truth for the running app. Views read from it and call its
// actions; it applies domain rules and persists through the repository.

import { clampLevel, dayKey, nextLevel } from '../domain/engine';
import type { LetterMode, Profile, ProgressSnapshot, Round, RoundScore, Settings } from '../domain/types';
import { newId } from '../data/ids';
import type { ProgressRepository } from '../data/repository';
import { emptySnapshot, parseSnapshot } from '../data/schema';

export interface RoundInput {
  level: number;
  score: RoundScore;
  speed: number;
  scientific: boolean;
  letterMode: LetterMode;
}

/** Settings as the game should apply them: scientific mode locks the protocol defaults. */
export function effectiveSettings(s: Settings): Settings {
  return s.scientific ? { ...s, instantFeedback: false, levelControls: false, speed: 1 } : s;
}

const now = (): string => new Date().toISOString();

export class AppStore {
  private readonly listeners = new Set<() => void>();

  private constructor(
    private readonly repo: ProgressRepository,
    private data: ProgressSnapshot,
  ) {}

  static async open(repo: ProgressRepository): Promise<AppStore> {
    return new AppStore(repo, await repo.load());
  }

  get snapshot(): Readonly<ProgressSnapshot> { return this.data; }
  get profile(): Readonly<Profile> { return this.data.profile; }
  get settings(): Readonly<Settings> { return this.data.settings; }
  get rounds(): readonly Round[] { return this.data.rounds; }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    this.listeners.forEach((l) => l());
  }

  /** Store a finished round and apply the levelling rule. */
  async recordRound(input: RoundInput, at: Date = new Date()): Promise<Round> {
    const day = dayKey(at);
    const round: Round = {
      id: newId(),
      createdAt: at.toISOString(),
      day,
      level: input.level,
      nextLevel: nextLevel(input.level, input.score.visual.percent, input.score.audio.percent),
      speed: input.speed,
      scientific: input.scientific,
      letterMode: input.letterMode,
      visual: input.score.visual,
      audio: input.score.audio,
    };
    this.data.rounds.push(round);
    this.data.profile = {
      ...this.data.profile,
      level: round.nextLevel,
      challengeStart: this.data.profile.challengeStart ?? day,
      updatedAt: now(),
    };
    await this.repo.appendRound(round);
    await this.repo.saveProfile(this.data.profile);
    this.emit();
    return round;
  }

  /** Manual level override (the "Level controls" setting). */
  async setLevel(level: number): Promise<void> {
    await this.updateProfile({ level: clampLevel(level) });
  }

  async markTutorialSeen(): Promise<void> {
    if (!this.data.profile.tutorialSeen) await this.updateProfile({ tutorialSeen: true });
  }

  async startNewChallenge(at: Date = new Date()): Promise<void> {
    await this.updateProfile({ challengeStart: dayKey(at) });
  }

  async updateSettings(patch: Partial<Omit<Settings, 'updatedAt'>>): Promise<void> {
    this.data.settings = { ...this.data.settings, ...patch, updatedAt: now() };
    await this.repo.saveSettings(this.data.settings);
    this.emit();
  }

  /** Replace all data from an export file. Throws SnapshotError on invalid input. */
  async importData(json: unknown): Promise<ProgressSnapshot> {
    const next = parseSnapshot(json);
    this.data = next;
    await this.repo.replace(next);
    this.emit();
    return next;
  }

  exportData(): ProgressSnapshot {
    return structuredClone(this.data);
  }

  async reset(): Promise<void> {
    await this.repo.clear();
    this.data = emptySnapshot();
    this.emit();
  }

  private async updateProfile(patch: Partial<Omit<Profile, 'updatedAt'>>): Promise<void> {
    this.data.profile = { ...this.data.profile, ...patch, updatedAt: now() };
    await this.repo.saveProfile(this.data.profile);
    this.emit();
  }
}
