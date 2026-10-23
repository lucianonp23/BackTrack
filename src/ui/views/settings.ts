import { dayKey } from '../../domain/engine';
import { LETTER_MODES } from '../../domain/types';
import type { LetterMode, Settings, VoiceLang } from '../../domain/types';
import { SnapshotError } from '../../data/schema';
import { LANGUAGES } from '../../services/speech';
import type { AppContext } from '../context';
import { confirmDialog, el, els, setText, toast } from '../dom';

/** Settings that map 1:1 to a checkbox with data-setting="NAME". */
type ToggleKey = { [K in keyof Settings]: Settings[K] extends boolean ? K : never }[keyof Settings];

const fmt = (x: number) => x.toFixed(2).replace(/0$/, '');

const LETTER_MODE_HINTS: Record<LetterMode, string> = {
  speak: 'Letters are read aloud',
  both: 'Read aloud and written inside the square',
  show: 'Silent: letters are written inside the square',
};

export function setupSettings({ store, speech, router }: AppContext): void {
  const langSelect = el<HTMLSelectElement>('#lang-select');
  const voiceSelect = el<HTMLSelectElement>('#voice-select');
  const speed = el<HTMLInputElement>('#speed');

  function updateSpeedLabel(): void {
    const sp = Number(speed.value);
    setText('#speed-label', `${fmt(sp)}× · ${fmt(3 / sp)} s per step`);
  }

  function fillVoices(): void {
    const { voiceLang, voiceURI } = store.settings;
    langSelect.value = voiceLang;
    const chosen = speech.setVoice(voiceLang, voiceURI);
    const voices = speech.listVoices();
    // Built with DOM nodes, not innerHTML: voice names come from the OS.
    voiceSelect.replaceChildren(...(voices.length
      ? voices.map((v) => new Option(`${v.name} (${v.lang})`, v.voiceURI, false, v.voiceURI === chosen))
      : [new Option('System default', '')]));
    // Voices load asynchronously on some browsers, so only warn once any exist.
    el('#voice-missing').hidden = voices.length > 0 || !speech.voicesLoaded;
  }

  function render(): void {
    const s = store.settings;
    els('[data-theme-option]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset['themeOption'] === s.theme)));
    els('[data-letter-mode-option]').forEach((b) =>
      b.setAttribute('aria-pressed', String(b.dataset['letterModeOption'] === s.letterMode)));
    setText('#letter-mode-hint', LETTER_MODE_HINTS[s.letterMode]);
    el('#voice-settings').classList.toggle('locked-section', s.letterMode === 'show');
    els<HTMLInputElement>('[data-setting]').forEach((input) => {
      input.checked = Boolean(s[input.dataset['setting'] as ToggleKey]);
    });
    el('#advanced').classList.toggle('locked', s.scientific);
    speed.value = String(s.speed);
    updateSpeedLabel();
    fillVoices();
  }

  router.onShow('settings', render);

  els('[data-theme-option]').forEach((btn) => btn.addEventListener('click', async () => {
    const theme = btn.dataset['themeOption'];
    if (theme !== 'system' && theme !== 'light' && theme !== 'dark') return;
    await store.updateSettings({ theme });
    render();
  }));

  els('[data-letter-mode-option]').forEach((btn) => btn.addEventListener('click', async () => {
    const mode = LETTER_MODES.find((m) => m === btn.dataset['letterModeOption']);
    if (!mode) return;
    await store.updateSettings({ letterMode: mode });
    render();
  }));

  els<HTMLInputElement>('[data-setting]').forEach((input) => input.addEventListener('change', async () => {
    await store.updateSettings({ [input.dataset['setting'] as ToggleKey]: input.checked });
    render();
  }));

  speed.addEventListener('input', () => {
    updateSpeedLabel();
    void store.updateSettings({ speed: Number(speed.value) });
  });

  langSelect.addEventListener('change', async () => {
    const lang = langSelect.value as VoiceLang;
    if (!(lang in LANGUAGES)) return;
    await store.updateSettings({ voiceLang: lang, voiceURI: null });
    fillVoices();
  });

  voiceSelect.addEventListener('change', () => {
    void store.updateSettings({ voiceURI: speech.setVoice(store.settings.voiceLang, voiceSelect.value || null) });
  });

  el('#btn-test-voice').addEventListener('click', () => {
    speech.unlock();
    (['C', 'H', 'K', 'L'] as const).forEach((l, i) => setTimeout(() => speech.speak(l), i * 800));
  });

  speech.onVoicesChanged(() => {
    speech.setVoice(store.settings.voiceLang, store.settings.voiceURI);
    if (router.current === 'settings') fillVoices();
  });

  el('#btn-export').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(store.exportData(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `backtrack-${dayKey()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  el<HTMLInputElement>('#import-file').addEventListener('change', async (e) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const json: unknown = JSON.parse(await file.text());
      const count = Array.isArray((json as { rounds?: unknown }).rounds) ? (json as { rounds: unknown[] }).rounds.length : 0;
      if (!(await confirmDialog(`Replace current data with ${count} imported rounds?`, 'Import'))) return;
      await store.importData(json);
      toast('Data imported');
      render();
    } catch (err) {
      toast(`Import failed: ${err instanceof SnapshotError || err instanceof SyntaxError ? err.message : 'unreadable file'}`);
    } finally {
      input.value = '';
    }
  });

  el('#btn-new-challenge').addEventListener('click', async () => {
    if (!(await confirmDialog('Start a fresh 20-day challenge from today? Your history is kept.', 'Start'))) return;
    await store.startNewChallenge();
    toast('New challenge started');
  });

  el('#btn-reset').addEventListener('click', async () => {
    if (!(await confirmDialog('Erase all rounds, levels and settings on this device? This cannot be undone.', 'Erase'))) return;
    await store.reset();
    toast('All data erased');
    router.show('home');
  });
}
