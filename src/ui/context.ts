import type { Speech } from '../services/speech';
import type { AppStore } from '../state/appStore';
import type { Router } from './router';

/** Shared services handed to every view module by main.ts (the composition root). */
export interface AppContext {
  store: AppStore;
  speech: Speech;
  router: Router;
  startRound(options?: { practice?: boolean }): void;
}
