// Composition root: builds the services and wires the views together.
// Swap the repository here to change where progress is stored.

import './styles.css';
import { registerSW } from 'virtual:pwa-register';
import { LocalStorageRepository } from './data/localStorageRepository';
import { Speech } from './services/speech';
import { applyTheme } from './services/theme';
import { AppStore, effectiveSettings } from './state/appStore';
import type { AppContext } from './ui/context';
import { mountDebugPanel } from './ui/debug';
import { Router } from './ui/router';
import { setupHome } from './ui/views/home';
import { PlayView, type RoundResult } from './ui/views/play';
import { setupResult } from './ui/views/result';
import { setupSettings } from './ui/views/settings';
import { setupStats } from './ui/views/stats';

async function main(): Promise<void> {
  const store = await AppStore.open(new LocalStorageRepository());
  const speech = new Speech();
  const router = new Router();
  speech.setVoice(store.settings.voiceLang, store.settings.voiceURI);
  applyTheme(store.settings.theme);
  store.subscribe(() => applyTheme(store.settings.theme));

  const play = new PlayView(speech, router, (result) => void onRoundFinished(result));

  const ctx: AppContext = {
    store, speech, router,
    startRound: ({ practice = false } = {}) =>
      play.start(store.profile.level, effectiveSettings(store.settings), { practice }),
  };

  const result = setupResult(ctx);
  setupHome(ctx);
  setupStats(ctx);
  setupSettings(ctx);
  mountDebugPanel(speech);

  async function onRoundFinished(r: RoundResult): Promise<void> {
    const levelBefore = store.profile.level;
    if (r.practice) await store.markTutorialSeen();
    else await store.recordRound({ level: r.level, score: r.score, speed: r.speed, scientific: r.scientific, letterMode: r.letterMode });
    result.show(r, levelBefore);
  }

  router.show('home');
  registerSW({ immediate: true });
}

void main();
