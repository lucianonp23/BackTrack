import type { Theme } from '../domain/types';

// Browser/status bar colours; must match --bg in styles.css.
const BAR_COLOR = { light: '#f4f1ea', dark: '#16181d' } as const;

/**
 * Apply the user's appearance choice. "system" removes the override so the
 * prefers-color-scheme media query decides. index.html runs an inline copy of
 * this before first paint to avoid a light/dark flash; keep the two in sync.
 */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.dataset['theme'] = theme;

  // index.html ships one theme-color tag per scheme; force both when overridden.
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((meta) => {
    const scheme = meta.media.includes('dark') ? 'dark' : 'light';
    meta.content = BAR_COLOR[theme === 'system' ? scheme : theme];
  });
}
