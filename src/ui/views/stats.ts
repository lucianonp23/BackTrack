import { CHALLENGE_DAYS, addDays, dayKey } from '../../domain/engine';
import { avg, roundsByDay, summarize } from '../../domain/stats';
import { calendar, lineChart } from '../charts';
import type { AppContext } from '../context';
import { el, setText } from '../dom';

const CHART_DAYS = 30;
const RECENT_ROUNDS = 15;

type DayPoint = Record<'level' | 'visual' | 'audio', number>;

export function setupStats({ store, router }: AppContext): void {
  router.onShow('stats', () => {
    const s = summarize(store.snapshot);
    setText('#st-level', s.level);
    setText('#st-max', s.maxLevel);
    setText('#st-streak', s.currentStreak);
    setText('#st-longest', s.longestStreak);
    setText('#st-sessions', s.sessions);
    setText('#st-rounds', s.rounds);
    setText('#st-avg', s.averageLevel.toFixed(1));
    setText('#st-challenge', `${s.challenge}/${CHALLENGE_DAYS}`);

    const today = dayKey();
    const byDay = roundsByDay(store.rounds);
    const days = Array.from({ length: CHART_DAYS }, (_, i) => addDays(today, i - (CHART_DAYS - 1)));
    const points = days.map((d): DayPoint | null => {
      const rs = byDay.get(d);
      return rs?.length ? {
        level: avg(rs.map((r) => r.level)),
        visual: avg(rs.map((r) => r.visual.percent)),
        audio: avg(rs.map((r) => r.audio.percent)),
      } : null;
    });
    el('#chart-level').innerHTML = lineChart(days, [{ key: 'level', color: 'var(--accent)' }], points,
      { min: 1, max: Math.max(4, s.maxLevel) + 1, step: 1 });
    el('#chart-accuracy').innerHTML = lineChart(days,
      [{ key: 'visual', color: 'var(--visual)' }, { key: 'audio', color: 'var(--audio)' }], points,
      { min: 0, max: 100, step: 25, suffix: '%' });

    const cal = calendar(byDay, today);
    setText('#cal-month', cal.title);
    el('#calendar').innerHTML = cal.html;

    const recent = store.rounds.slice(-RECENT_ROUNDS).reverse();
    el('#rounds-body').innerHTML = recent.length ? recent.map((r) => {
      const dir = r.nextLevel > r.level ? '<span class="up">▲</span>' : r.nextLevel < r.level ? '<span class="down">▼</span>' : '';
      const when = new Date(r.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      return `<tr><td>${when}</td><td>${r.level}</td><td>${r.visual.percent}%</td><td>${r.audio.percent}%</td><td>${dir}</td></tr>`;
    }).join('') : '<tr><td colspan="5" class="muted">No rounds yet.</td></tr>';
  });
}
