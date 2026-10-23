import { CHALLENGE_DAYS, MAX_LEVEL, ROUNDS_PER_SESSION } from '../../domain/engine';
import { challengeProgress, roundsOnDay, summarize, summarizeDay } from '../../domain/stats';
import type { ChannelTally } from '../../domain/types';
import { effectiveSettings } from '../../state/appStore';
import type { AppContext } from '../context';
import { el, setText } from '../dom';
import type { RoundResult } from './play';

const PRAISE = {
  perfect: ['Zero mistakes!', 'Not a single mistake!', '100 percent!'],
  up: ['Up another level!', 'Leveling up!', 'Nicely done!'],
  near: ['Almost leveled up!', 'Nearly there!', 'So close!'],
  stay: ['Steady work.', 'Keep at it.', 'Holding the line.'],
  down: ['That one was tough.', 'Dual n-back is hard!', 'Shake it off.'],
} as const;

const pick = <T>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)]!;
const RING_CIRCUMFERENCE = 2 * Math.PI * 52;

function setRing(ring: SVGCircleElement, pct: number): void {
  ring.style.strokeDashoffset = String(RING_CIRCUMFERENCE);
  // Two frames so the transition runs from empty to the new value.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    ring.style.strokeDashoffset = String(RING_CIRCUMFERENCE * (1 - pct / 100));
  }));
}

const describe = (s: ChannelTally) =>
  `${s.hits} hit${s.hits === 1 ? '' : 's'}, ${s.misses} missed, ${s.falseAlarms} false`;

export function setupResult(ctx: AppContext): { show(result: RoundResult, levelBefore: number): void } {
  const { store, router } = ctx;
  let onNext = () => {};

  el('#btn-next').addEventListener('click', () => onNext());
  el('#btn-home').addEventListener('click', () => router.show('home'));
  el('#btn-extra').addEventListener('click', () => ctx.startRound());

  const changeLevel = async (delta: number) => {
    await store.setLevel(store.profile.level + delta);
    setText('#lvl-value', store.profile.level);
  };
  el('#lvl-dec').addEventListener('click', () => void changeLevel(-1));
  el('#lvl-inc').addEventListener('click', () => void changeLevel(1));

  function showSession(): void {
    const today = roundsOnDay(store.rounds);
    const day = summarizeDay(today);
    const progress = challengeProgress(store.snapshot);
    setText('#ses-avg', day.averageLevel.toFixed(1));
    setText('#ses-max', day.maxLevel);
    setText('#ses-visual', `${Math.round(day.averageVisual)}%`);
    setText('#ses-audio', `${Math.round(day.averageAudio)}%`);
    setText('#ses-streak', summarize(store.snapshot).currentStreak);
    setText('#ses-challenge', `${progress}/${CHALLENGE_DAYS}`);
    const left = CHALLENGE_DAYS - progress;
    setText('#ses-message', left > 0
      ? `${left} more session${left === 1 ? '' : 's'} to finish your 20-day challenge. See you tomorrow!`
      : 'You’ve completed the 20-day challenge. Keep practicing to hold on to your gains.');
    router.show('session');
  }

  function show({ practice, score, letterMode }: RoundResult, from: number): void {
    const letterLabel = letterMode === 'show' ? 'Letter' : 'Sound';
    setText('#score-audio-label', letterLabel);
    const v = score.visual.percent;
    const a = score.audio.percent;
    const to = store.profile.level;
    const todayCount = roundsOnDay(store.rounds).length;

    setText('#result-round', practice ? 'Practice round'
      : todayCount > ROUNDS_PER_SESSION ? `Extra round ${todayCount - ROUNDS_PER_SESSION}`
      : `Round ${todayCount} of ${ROUNDS_PER_SESSION}`);

    let title: string;
    if (v === 100 && a === 100) title = pick(PRAISE.perfect);
    else if (!practice && to > from) title = pick(PRAISE.up);
    else if (!practice && to < from) title = pick(PRAISE.down);
    else if (Math.min(v, a) >= 80) title = pick(PRAISE.near);
    else title = pick(PRAISE.stay);
    setText('#result-title', title);

    setText('#score-visual', `${v}%`);
    setText('#score-audio', `${a}%`);
    setRing(el<SVGCircleElement & HTMLElement>('#ring-visual'), v);
    setRing(el<SVGCircleElement & HTMLElement>('#ring-audio'), a);
    setText('#result-detail', `Position: ${describe(score.visual)}\n${letterLabel}: ${describe(score.audio)}`);

    const badge = el('#result-level');
    badge.className = 'level-change';
    if (practice) {
      badge.textContent = Math.min(v, a) >= 75
        ? 'You’ve got the hang of it. Ready for a real session!'
        : 'Tricky at first. Try another practice round.';
    } else if (from === MAX_LEVEL && to === MAX_LEVEL && v >= 90 && a >= 90) {
      badge.classList.add('up');
      badge.textContent = `Level stays at ${MAX_LEVEL} (maximum)`;
    } else if (to > from) {
      badge.classList.add('up');
      badge.textContent = `Level raised to ${to}`;
    } else if (to < from) {
      badge.classList.add('down');
      badge.textContent = `Level lowered to ${to}`;
    } else {
      badge.textContent = `Level stays at ${to}`;
    }

    el('#level-picker').hidden = practice || !effectiveSettings(store.settings).levelControls;
    setText('#lvl-value', to);

    const sessionJustDone = !practice && todayCount === ROUNDS_PER_SESSION;
    setText('#btn-next', practice ? 'Practice again' : sessionJustDone ? 'See session summary' : 'Next round');
    onNext = () => (sessionJustDone ? showSession() : ctx.startRound({ practice }));
    router.show('result');
  }

  return { show };
}
