import type { Speech } from '../services/speech';

/** Open the app with ?debug to see a live speech-engine log (for on-device testing). */
export function mountDebugPanel(speech: Speech): void {
  if (!new URLSearchParams(location.search).has('debug')) return;
  const panel = document.createElement('pre');
  panel.className = 'debug-panel';
  document.body.append(panel);
  setInterval(() => {
    const d = speech.diagnostics();
    const state = d.state
      ? `speaking=${d.state.speaking} pending=${d.state.pending} paused=${d.state.paused}`
      : 'no speechSynthesis';
    panel.textContent = `voice: ${d.voice}\n${state}\n${d.events.slice(-8).join('\n') || 'no problems logged'}`;
  }, 500);
}
