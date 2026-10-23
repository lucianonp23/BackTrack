import { els } from './dom';

export type ViewName = 'home' | 'play' | 'result' | 'session' | 'stats' | 'settings' | 'howto';

/**
 * Minimal view switcher: every screen is a <section id="view-NAME"> in
 * index.html; exactly one carries [data-active]. Views may register a render
 * hook that runs each time they are shown.
 */
export class Router {
  private readonly renderers = new Map<ViewName, () => void>();
  private currentView: ViewName = 'home';

  constructor() {
    // Any element with data-nav="NAME" navigates on click.
    document.addEventListener('click', (e) => {
      const nav = (e.target as Element | null)?.closest<HTMLElement>('[data-nav]');
      if (nav?.dataset['nav']) this.show(nav.dataset['nav'] as ViewName);
    });
  }

  get current(): ViewName {
    return this.currentView;
  }

  onShow(view: ViewName, render: () => void): void {
    this.renderers.set(view, render);
  }

  show(view: ViewName): void {
    this.currentView = view;
    els('.view').forEach((v) => v.toggleAttribute('data-active', v.id === `view-${view}`));
    this.renderers.get(view)?.();
  }

  /** Re-render the visible view, e.g. after the store changed. */
  refresh(): void {
    this.renderers.get(this.currentView)?.();
  }
}
