// Keeps the screen on during a round where the Screen Wake Lock API exists.

let sentinel: WakeLockSentinel | null = null;

export async function keepScreenOn(): Promise<void> {
  try {
    sentinel = (await navigator.wakeLock?.request('screen')) ?? null;
  } catch {
    sentinel = null;
  }
}

export function releaseScreen(): void {
  sentinel?.release().catch(() => {});
  sentinel = null;
}
