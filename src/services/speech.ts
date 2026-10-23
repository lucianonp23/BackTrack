// Letter playback via the Web Speech API, with a WebAudio tone fallback.
// iOS only allows speech after a user gesture, so call unlock() from a tap.

import { LETTERS } from '../domain/engine';
import type { Letter, VoiceLang } from '../domain/types';

export const LANGUAGES: Record<VoiceLang, { label: string; prefer: RegExp; fallbackLang: string }> = {
  en: { label: 'English', prefer: /en[-_]US/i, fallbackLang: 'en-US' },
  pt: { label: 'Português (Brasil)', prefer: /pt[-_]BR/i, fallbackLang: 'pt-BR' },
};

// What the synthesiser is asked to say for each letter. Spelling out the letter
// name avoids engines reading a lone character oddly (e.g. "H" as a sound).
const LETTER_NAMES: Record<VoiceLang, Record<Letter, string>> = {
  en: { C: 'C', H: 'H', K: 'K', L: 'L', Q: 'Q', R: 'R', S: 'S', T: 'T' },
  pt: { C: 'cê', H: 'agá', K: 'cá', L: 'ele', Q: 'quê', R: 'erre', S: 'esse', T: 'tê' },
};

const START_TIMEOUT_MS = 1000;
const MAX_EVENTS = 40;

export interface SpeechDiagnostics {
  events: string[];
  voice: string;
  state: { speaking: boolean; pending: boolean; paused: boolean } | null;
}

type AudioContextCtor = typeof AudioContext;

export class Speech {
  private readonly synth: SpeechSynthesis | null = 'speechSynthesis' in window ? window.speechSynthesis : null;
  private lang: VoiceLang = 'en';
  private voice: SpeechSynthesisVoice | null = null;
  private ctx: AudioContext | null = null;
  // Strong reference to the in-flight utterance: Chrome and Safari can garbage-
  // collect it mid-speech, which drops its 'end' event and wedges the queue.
  private current: SpeechSynthesisUtterance | null = null;
  // Ring buffer of speech problems, shown by the ?debug overlay.
  private readonly events: string[] = [];
  private readonly t0 = performance.now();

  get available(): boolean {
    return this.synth !== null;
  }

  diagnostics(): SpeechDiagnostics {
    const s = this.synth;
    return {
      events: [...this.events],
      voice: this.voice ? `${this.voice.name} (${this.voice.lang})` : 'default',
      state: s ? { speaking: s.speaking, pending: s.pending, paused: s.paused } : null,
    };
  }

  /** Installed voices for a language (all regions). */
  listVoices(forLang: VoiceLang = this.lang): SpeechSynthesisVoice[] {
    if (!this.synth) return [];
    const re = new RegExp(`^${forLang}([-_]|$)`, 'i');
    return this.synth.getVoices().filter((v) => re.test(v.lang));
  }

  /** True once the browser has loaded its voice list (it arrives asynchronously in Chrome). */
  get voicesLoaded(): boolean {
    return (this.synth?.getVoices().length ?? 0) > 0;
  }

  onVoicesChanged(cb: () => void): void {
    this.synth?.addEventListener('voiceschanged', cb);
  }

  /** Pick the language and a voice for it; returns the chosen voiceURI (or null). */
  setVoice(language: VoiceLang, uri: string | null): string | null {
    this.lang = language in LANGUAGES ? language : 'en';
    const { prefer } = LANGUAGES[this.lang];
    const voices = this.listVoices();
    this.voice = voices.find((v) => v.voiceURI === uri)
      ?? voices.find((v) => v.localService && prefer.test(v.lang))
      ?? voices.find((v) => prefer.test(v.lang))
      ?? voices[0]
      ?? null;
    return this.voice?.voiceURI ?? null;
  }

  /** Clear a stuck or paused engine. Safe to call at any time. */
  reset(): void {
    const s = this.synth;
    if (!s) return;
    if (s.speaking || s.pending) s.cancel();
    if (s.paused) s.resume();
    this.current = null;
  }

  /** Must run inside a user gesture (tap/click) before the first letter on iOS. */
  unlock(): void {
    if (this.synth) {
      this.reset();
      const u = new SpeechSynthesisUtterance(' ');
      u.volume = 0;
      this.synth.speak(u);
      return;
    }
    // WebAudio is only needed for the tone fallback; an idle AudioContext on iOS
    // holds the audio session and can interfere with speech.
    try {
      const Ctor: AudioContextCtor | undefined = window.AudioContext
        ?? (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;
      if (Ctor) this.ctx ??= new Ctor();
      if (this.ctx?.state === 'suspended') void this.ctx.resume();
    } catch { /* no WebAudio */ }
  }

  speak(letter: Letter, retry = true): void {
    const s = this.synth;
    if (!s) return this.tone(letter);
    // Only cancel when something is actually queued: WebKit can silently drop an
    // utterance spoken right after an unnecessary cancel().
    if (s.speaking || s.pending) s.cancel();
    // Interruptions (calls, lock screen, app switch) can leave the engine paused,
    // after which every speak() just queues in silence.
    if (s.paused) s.resume();
    // Voice objects can go stale after 'voiceschanged'; re-resolve if so.
    const voice = this.voice;
    if (voice && !s.getVoices().some((v) => v.voiceURI === voice.voiceURI)) {
      this.record(`voice ${voice.name} vanished, re-selecting`);
      this.setVoice(this.lang, voice.voiceURI);
    }

    const text = LETTER_NAMES[this.lang][letter];
    const u = new SpeechSynthesisUtterance(text);
    if (this.voice) u.voice = this.voice;
    u.lang = this.voice?.lang ?? LANGUAGES[this.lang].fallbackLang;
    u.rate = 1.0;
    let started = false;
    u.onstart = () => { started = true; };
    u.onend = () => { if (this.current === u) this.current = null; };
    u.onerror = (e) => {
      // 'interrupted'/'canceled' are our own cancel() calls, not failures.
      if (e.error !== 'interrupted' && e.error !== 'canceled') this.record(`error "${text}": ${e.error}`);
      if (this.current === u) this.current = null;
    };
    this.current = u;
    s.speak(u);

    // Watchdog: if the engine hasn't started within a second it's wedged.
    // Reset it and try once more so this letter still gets heard.
    setTimeout(() => {
      if (started || this.current !== u) return;
      this.record(`stalled "${text}" (speaking=${s.speaking} pending=${s.pending} paused=${s.paused})${retry ? ', retrying' : ''}`);
      s.cancel();
      if (s.paused) s.resume();
      this.current = null;
      if (retry) this.speak(letter, false);
    }, START_TIMEOUT_MS);
  }

  stop(): void {
    this.reset();
  }

  private tone(letter: Letter): void {
    const ctx = this.ctx;
    if (!ctx) return;
    // Distinct pitch per letter on a pentatonic-ish scale.
    const freqs = [262, 294, 330, 392, 440, 523, 587, 659];
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = freqs[LETTERS.indexOf(letter) % freqs.length]!;
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
  }

  private record(msg: string): void {
    this.events.push(`${((performance.now() - this.t0) / 1000).toFixed(1)}s ${msg}`);
    if (this.events.length > MAX_EVENTS) this.events.shift();
  }
}
