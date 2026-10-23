import { CHALLENGE_DAYS, ROUNDS_PER_SESSION } from '../../domain/engine';
import { roundsOnDay, summarize } from '../../domain/stats';
import type { AppContext } from '../context';
import { confirmDialog, el, setText } from '../dom';

export function setupHome(ctx: AppContext): void {
  const { store, router } = ctx;

  router.onShow('home', () => {
    const today = roundsOnDay(store.rounds);
    const summary = summarize(store.snapshot);
    const level = store.profile.level;

    setText('#home-level', level);
    setText('#home-sub', level === 1
      ? 'Compare each step with the one right before'
      : `Compare each step with the one ${level} steps back`);
    const extra = today.length - ROUNDS_PER_SESSION;
    setText('#home-rounds', `${Math.min(today.length, ROUNDS_PER_SESSION)} / ${ROUNDS_PER_SESSION} rounds${extra > 0 ? ` (+${extra})` : ''}`);
    el('#home-dots').innerHTML = Array.from({ length: ROUNDS_PER_SESSION },
      (_, i) => `<i class="${i < today.length ? 'done' : ''}"></i>`).join('');
    setText('#home-streak', summary.currentStreak);
    setText('#home-challenge', `${summary.challenge}/${CHALLENGE_DAYS}`);
    setText('#home-best', summary.maxLevel);
    setText('#btn-play', today.length === 0 ? 'Start today’s session'
      : today.length < ROUNDS_PER_SESSION ? `Continue · round ${today.length + 1}` : 'Play an extra round');
  });

  el('#btn-play').addEventListener('click', async () => {
    if (!store.profile.tutorialSeen && store.rounds.length === 0) {
      const wantsTutorial = await confirmDialog(
        'New here? The rules are tricky at first. Read the instructions and try a 1-back practice round first.',
        'Show me how',
      );
      if (wantsTutorial) return router.show('howto');
      await store.markTutorialSeen();
    }
    ctx.startRound();
  });

  el('#btn-practice').addEventListener('click', () => ctx.startRound({ practice: true }));
}
