// Tiny SVG/HTML chart builders. No library: two charts don't justify one yet.

import { ROUNDS_PER_SESSION } from '../domain/engine';
import type { DayKey, Round } from '../domain/types';

export interface Series<K extends string> {
  key: K;
  color: string;
}

export interface LineChartOptions {
  min: number;
  max: number;
  step: number;
  suffix?: string;
  emptyText?: string;
}

/** Line chart over consecutive days; `points[i]` is null for days without data. */
export function lineChart<K extends string>(
  days: readonly DayKey[],
  series: readonly Series<K>[],
  points: readonly (Record<K, number> | null)[],
  { min, max, step, suffix = '', emptyText = 'Play a round to see your progress' }: LineChartOptions,
): string {
  const W = 320, H = 150, L = 36, R = 8, T = 8, B = 20;
  const last = days.length - 1;
  const x = (i: number) => L + (i / last) * (W - L - R);
  const y = (v: number) => T + (1 - (v - min) / (max - min)) * (H - T - B);
  let out = `<svg viewBox="0 0 ${W} ${H}" role="img">`;
  for (let v = min; v <= max; v += step) {
    out += `<line class="axis" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/>`;
    out += `<text class="lbl" x="${L - 4}" y="${y(v) + 3}" text-anchor="end">${v}${suffix}</text>`;
  }
  const mid = Math.round(last / 2);
  for (const i of [0, mid, last]) {
    const [, m, d] = days[i]!.split('-');
    const anchor = i === 0 ? 'start' : i === last ? 'end' : 'middle';
    out += `<text class="lbl" x="${x(i)}" y="${H - 4}" text-anchor="${anchor}">${Number(d)}/${Number(m)}</text>`;
  }
  if (!points.some(Boolean)) {
    return `${out}<text class="empty" x="${W / 2}" y="${H / 2}" text-anchor="middle">${emptyText}</text></svg>`;
  }
  for (const s of series) {
    const coords = points.flatMap((p, i) => (p ? [[x(i), y(p[s.key])] as const] : []));
    if (coords.length > 1) {
      out += `<polyline points="${coords.map((c) => c.join(',')).join(' ')}" stroke="${s.color}" stroke-width="2" fill="none"/>`;
    }
    out += coords.map(([cx, cy]) => `<circle cx="${cx}" cy="${cy}" r="3" fill="${s.color}" stroke="none"/>`).join('');
  }
  return `${out}</svg>`;
}

/** Month grid (Monday first) shading days by rounds played. */
export function calendar(byDay: ReadonlyMap<DayKey, readonly Round[]>, today: DayKey): { title: string; html: string } {
  const [y, m] = today.split('-').map(Number) as [number, number];
  const first = new Date(y, m - 1, 1);
  const daysInMonth = new Date(y, m, 0).getDate();
  const lead = (first.getDay() + 6) % 7;
  let html = ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d) => `<span class="dow">${d}</span>`).join('');
  html += '<span class="blank"></span>'.repeat(lead);
  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const n = byDay.get(key)?.length ?? 0;
    const cls = n >= ROUNDS_PER_SESSION ? 'done' : n > 0 ? 'partial' : '';
    html += `<span class="day ${cls} ${key === today ? 'today' : ''}" title="${n} rounds">${d}</span>`;
  }
  return { title: first.toLocaleString(undefined, { month: 'long', year: 'numeric' }), html };
}
