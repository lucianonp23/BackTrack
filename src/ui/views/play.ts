// The round loop: presents stimuli on a fixed schedule, collects taps, and
// reports the scored result. Knows nothing about persistence or levelling.

import { generateRound, isLetterMatch, isPositionMatch, scoreRound, timingForSpeed } from '../../domain/engine';
import type { LetterMode, RoundScore, RoundSequence, Settings } from '../../domain/types';
import type { Speech } from '../../services/speech';
import { keepScreenOn, releaseScreen } from '../../services/wakeLock';
import { confirmDialog, el, els, isDialogOpen, setText, toast } from '../dom';
import type { Router } from '../router';

export interface RoundResult {
  practice: boolean;
  level: number;
  score: RoundScore;
  speed: number;
  scientific: boolean;
  letterMode: LetterMode;
}

type AnswerChannel = 'position' | 'sound';

interface ActiveRound {
  practice: boolean;
  sequence: RoundSequence;
  settings: Settings;
  trialMs: number;
  stimulusMs: number;
  feedback: boolean;
  index: number;
  positionTaps: boolean[];
  soundTaps: boolean[];
  timers: ReturnType<typeof setTimeout>[];
  t0: number;
}

const LEAD_IN_MS = 1200;
/** Grid index of the centre cell, which holds the fixation cross and is never lit. */
const CENTER = 4;
const FLASH_MS = 350;

export class PlayView {
  private game: ActiveRound | null = null;
  private interruptedPractice: boolean | null = null;
  private readonly cells = els('#board .cell');
  private readonly positionBtn = el('#btn-position');
  private readonly soundBtn = el('#btn-sound');

  constructor(
    private readonly speech: Speech,
    private readonly router: Router,
    private readonly onFinish: (result: RoundResult) => void,
  ) {
    this.positionBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); this.respond('position'); });
    this.soundBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); this.respond('sound'); });
    el('#btn-abort').addEventListener('click', () => void this.abort());
    document.addEventListener('keydown', (e) => this.onKey(e));
    document.addEventListener('visibilitychange', () => this.onVisibilityChange());
  }

  get playing(): boolean {
    return this.game !== null;
  }

  /** `settings` must already be effective (scientific mode applied). Call from a user gesture. */
  start(level: number, settings: Settings, { practice = false } = {}): void {
    if (settings.letterMode !== 'show') this.speech.unlock();
    const n = practice ? 1 : level;
    const sequence = generateRound(n);
    const { trialMs, stimulusMs } = timingForSpeed(settings.speed);
    const total = sequence.positions.length;
    this.game = {
      practice, sequence, settings, trialMs, stimulusMs,
      feedback: practice || settings.instantFeedback,
      index: -1,
      positionTaps: new Array<boolean>(total).fill(false),
      soundTaps: new Array<boolean>(total).fill(false),
      timers: [],
      t0: performance.now() + LEAD_IN_MS,
    };

    el('#board').classList.toggle('grid-on', settings.showGrid);
    el('#answer-row').classList.toggle('swapped', settings.swapButtons);
    el('kbd', this.positionBtn).textContent = settings.swapButtons ? 'L' : 'A';
    el('kbd', this.soundBtn).textContent = settings.swapButtons ? 'A' : 'L';
    const silent = settings.letterMode === 'show';
    el('span', this.soundBtn).textContent = silent ? 'Letter' : 'Sound';
    el('.icon-sound', this.soundBtn).toggleAttribute('hidden', silent);
    el('.icon-letter', this.soundBtn).toggleAttribute('hidden', !silent);
    setText('#play-level', `${n}-back${practice ? ' · practice' : ''}`);
    setText('#play-hint', 'Get ready…');
    this.updateProgress();
    this.clearButtons();
    this.router.show('play');
    void keepScreenOn();
    this.schedule(0);
  }

  private schedule(i: number): void {
    const g = this.game;
    if (!g) return;
    const at = g.t0 + i * g.trialMs;
    g.timers.push(setTimeout(() => {
      if (this.game !== g) return;
      if (i >= g.sequence.positions.length) return this.finish();
      this.presentTrial(i);
      this.schedule(i + 1);
    }, Math.max(0, at - performance.now())));
  }

  private presentTrial(i: number): void {
    const g = this.game!;
    if (g.index >= 0 && g.feedback) this.revealMissed(g.index);
    g.index = i;
    this.clearButtons();
    const n = g.sequence.n;
    setText('#play-hint', i < n ? `Remember… (${n - i} until first match is possible)` : '');
    this.updateProgress();

    const pos = g.sequence.positions[i]!;
    const letter = g.sequence.letters[i]!;
    const mode = g.settings.letterMode;
    this.cells.forEach((c, idx) => {
      c.classList.toggle('lit', idx === pos);
      if (idx !== CENTER) c.textContent = idx === pos && mode !== 'speak' ? letter : '';
    });
    if (mode !== 'show') this.speech.speak(letter);
    g.timers.push(setTimeout(() => this.clearCell(pos), g.stimulusMs));
  }

  private clearCell(idx: number): void {
    const cell = this.cells[idx];
    if (!cell) return;
    cell.classList.remove('lit');
    if (idx !== CENTER) cell.textContent = '';
  }

  private updateProgress(): void {
    const g = this.game!;
    const total = g.sequence.positions.length;
    const done = Math.max(0, g.index + 1);
    setText('#play-count', `${done} / ${total}`);
    el('#play-bar').style.width = `${(done / total) * 100}%`;
  }

  private clearButtons(): void {
    [this.positionBtn, this.soundBtn].forEach((b) => b.classList.remove('pressed', 'correct', 'wrong', 'missed'));
  }

  /** With feedback on, briefly mark a button whose target went unanswered. */
  private revealMissed(i: number): void {
    const g = this.game!;
    if (isPositionMatch(g.sequence, i) && !g.positionTaps[i]) this.flash(this.positionBtn, 'missed');
    if (isLetterMatch(g.sequence, i) && !g.soundTaps[i]) this.flash(this.soundBtn, 'missed');
  }

  private flash(btn: HTMLElement, cls: string): void {
    btn.classList.add(cls);
    setTimeout(() => btn.classList.remove(cls), FLASH_MS);
  }

  private respond(channel: AnswerChannel): void {
    const g = this.game;
    if (!g || g.index < 0) return;
    const i = g.index;
    const taps = channel === 'position' ? g.positionTaps : g.soundTaps;
    const btn = channel === 'position' ? this.positionBtn : this.soundBtn;
    const isMatch = channel === 'position' ? isPositionMatch(g.sequence, i) : isLetterMatch(g.sequence, i);

    if (taps[i]) {
      if (!g.settings.deselection) return;
      taps[i] = false;
      btn.classList.remove('pressed', 'correct', 'wrong');
      return;
    }
    taps[i] = true;
    if (g.settings.haptics) navigator.vibrate?.(12);
    btn.classList.remove('missed');
    btn.classList.add(g.feedback ? (isMatch ? 'correct' : 'wrong') : 'pressed');
  }

  private onKey(e: KeyboardEvent): void {
    const g = this.game;
    if (!g || e.repeat || isDialogOpen()) return;
    // A / ← hit the left button, L / → the right one, whichever channel is there.
    const swapped = g.settings.swapButtons;
    const k = e.key.toLowerCase();
    if (k === 'a' || k === 'arrowleft') this.respond(swapped ? 'sound' : 'position');
    else if (k === 'l' || k === 'arrowright') this.respond(swapped ? 'position' : 'sound');
    else if (k === 'escape') void this.abort();
  }

  /** Stop everything; returns the round that was running, if any. */
  private halt(): ActiveRound | null {
    const g = this.game;
    if (!g) return null;
    g.timers.forEach(clearTimeout);
    this.cells.forEach((_, idx) => this.clearCell(idx));
    this.speech.stop();
    releaseScreen();
    this.game = null;
    return g;
  }

  private async abort(): Promise<void> {
    const g = this.halt();
    if (!g) return;
    if (await confirmDialog('Stop this round? It won’t be counted.', 'Stop round')) {
      this.router.show('home');
      return;
    }
    // "Cancel" means keep playing: restart the round cleanly.
    this.start(g.sequence.n, g.settings, { practice: g.practice });
  }

  private onVisibilityChange(): void {
    if (document.hidden) {
      const g = this.halt();
      if (g) {
        this.interruptedPractice = g.practice;
        this.router.show('home');
      }
      return;
    }
    // Backgrounding can leave the speech engine paused or wedged.
    this.speech.reset();
    if (this.interruptedPractice !== null) {
      toast('Your round was interrupted, so it wasn’t counted.');
      this.interruptedPractice = null;
    }
  }

  private finish(): void {
    const g = this.halt();
    if (!g) return;
    this.onFinish({
      practice: g.practice,
      level: g.sequence.n,
      score: scoreRound(g.sequence, g.positionTaps, g.soundTaps),
      speed: g.settings.speed,
      scientific: g.settings.scientific,
      letterMode: g.settings.letterMode,
    });
  }
}
