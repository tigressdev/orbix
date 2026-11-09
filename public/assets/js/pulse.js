// Home price pulse: every tracked route with its quote date, cheapest fare, history and day-over-day trend.
import { h, s, clear } from './ui.js';
import { api } from './api.js';
import { money, observed, day, plural } from './fmt.js';

let data = null, filter = 'all', showAll = false, host = null;
const LIMIT = 12;

export async function loadPulse() {
  try { data = await api.get('/api/trends'); } catch (e) { data = { error: e.message }; }
  renderPulse();
}
export function showPulse(el) {
  host = el;
  renderPulse();
  loadPulse();
}

const arrow = (t) => ({ down: '↓', up: '↑', flat: '→', baseline: '•' }[t.status]);
const trendChip = (t) => {
  if (t.status === 'baseline') return h('span', { class: 'chip', title: 'Only one snapshot so far: a trend needs a second day.' }, '• baseline');
  const cls = t.status === 'down' ? 'chip chip-teal' : t.status === 'up' ? 'chip chip-amber' : 'chip';
  return h('span', { class: cls, title: `Median change across ${plural(t.dates_compared, 'departure date', 'departure dates')}, ${day(t.from_day)} → ${day(t.to_day)}` },
    `${arrow(t)} ${t.pct > 0 ? '+' : ''}${t.pct.toFixed(1)}%`);
};

function spark(r) {
  const W = 96, H = 28;
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'spark', role: 'img', 'aria-label': `Price history for ${r.code}` });
  if (r.history.length >= 2) {
    const vals = r.history.map((p) => p.min_usd), lo = Math.min(...vals), hi = Math.max(...vals), span = hi - lo || 1;
    const pts = r.history.map((p, i) => `${(i / (r.history.length - 1)) * (W - 6) + 3},${H - 4 - ((p.min_usd - lo) / span) * (H - 8)}`).join(' ');
    svg.append(s('polyline', { points: pts, fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
    return svg;
  }
  // baseline day: bars = cheapest fare per departure date (a cross-section, not a history)
  const dates = r.dates.slice(0, 8), hi = Math.max(...dates.map((d) => d.min_usd)), bw = Math.min(14, (W - 4) / dates.length), x0 = (W - bw * dates.length) / 2;
  dates.forEach((d, i) => svg.append(s('rect', { x: x0 + i * bw + 1, width: Math.max(2, bw - 3), y: H - 3 - (d.min_usd / hi) * (H - 6), height: (d.min_usd / hi) * (H - 6), rx: 1.5, fill: 'currentColor', opacity: 0.55 },
    s('title', {}, `${day(d.dep_date)}: ${money(d.min_usd)}`))));
  return svg;
}

export function renderPulse() {
  const el = host;
  if (!el || !el.isConnected) return;
  clear(el);
  if (!data) { el.append(h('p', { class: 'muted' }, h('span', { class: 'spinner' }), 'Loading the price watch…')); return; }
  if (data.error) { el.append(h('p', { class: 'err' }, `Price watch unavailable: ${data.error}`)); return; }
  const sm = data.summary;
  el.append(h('div', { class: 'pulse-head' },
    h('div', {}, h('p', { class: 'eyebrow' }, 'Price pulse'), h('h2', { class: 'serif' }, 'What the fares are doing'),
      h('p', { class: 'muted small' }, `Every route you can build, as last quoted. Compared day over day in US dollars, each offer converted at the rate of the day it was quoted.`))));

  const movers = data.routes.filter((r) => r.trend.status === 'down' || r.trend.status === 'up');
  if (sm.snapshot_days < 2) {
    el.append(h('div', { class: 'note' }, h('b', {}, `Baseline recorded on ${sm.first_day ? day(sm.first_day) + ' ' + sm.first_day.slice(0, 4) : '—'}. `),
      'Trends start with the next collection: save a new quotes file dated that day (or run the daily SerpApi job) and this panel will show which routes are falling and which are rising. Until then the bars show the cheapest fare for each departure date quoted.'));
  } else {
    const fmtMove = (r) => `${r.code} ${r.trend.pct > 0 ? '+' : ''}${r.trend.pct.toFixed(1)}%`;
    const falling = movers.filter((r) => r.trend.status === 'down').sort((a, b) => a.trend.pct - b.trend.pct).slice(0, 6);
    const rising = movers.filter((r) => r.trend.status === 'up').sort((a, b) => b.trend.pct - a.trend.pct).slice(0, 6);
    el.append(h('div', { class: 'moves' },
      h('div', { class: 'move down' }, h('b', {}, '↓ Falling'), falling.length ? falling.map(fmtMove).join(' · ') : 'none since the last snapshot'),
      h('div', { class: 'move up' }, h('b', {}, '↑ Rising'), rising.length ? rising.map(fmtMove).join(' · ') : 'none since the last snapshot')));
  }
  const kpi = (v, l, cls = '') => h('div', { class: `kpi ${cls}` }, h('div', { class: 'v num' }, String(v)), h('div', { class: 'l' }, l));
  el.append(h('div', { class: 'kpis' }, kpi(sm.routes, 'routes tracked'), kpi(sm.offers, 'offers'), kpi(sm.snapshot_days, 'snapshot days'),
    kpi(sm.last_day ? day(sm.last_day) : '—', 'last quote day'), kpi(sm.falling, 'falling', 'good'), kpi(sm.rising, 'rising', 'warn'), kpi(sm.stable, 'stable'),
    kpi(sm.stale, `stale (>${sm.max_age_days} days)`, sm.stale ? 'warn' : '')));

  const FILTERS = [['all', 'All'], ['priority', 'Priority cities'], ['down', 'Falling'], ['up', 'Rising'], ['stale', 'Stale']];
  el.append(h('div', { class: 'seg', role: 'group', 'aria-label': 'Filter routes', style: { margin: '14px 0 10px' } },
    FILTERS.map(([k, label]) => h('button', { 'aria-pressed': filter === k, onclick: () => { filter = k; renderPulse(); } }, label))));
  let rows = data.routes.filter((r) => filter === 'all' || (filter === 'priority' && r.priority) || (filter === 'stale' && r.stale) || r.trend.status === filter);
  rows = [...rows].sort((a, b) => (b.priority - a.priority) || a.code.localeCompare(b.code));
  const shown = showAll ? rows : rows.slice(0, LIMIT);
  if (!rows.length) { el.append(h('div', { class: 'empty' }, 'No route matches this filter yet.')); return; }
  const table = h('table', { class: 'pulse-table' }, h('thead', {}, h('tr', {}, ['Route', 'Quoted', 'Cheapest fare', 'Trend', 'History'].map((t) => h('th', {}, t)))));
  const body = h('tbody', {});
  shown.forEach((r) => body.append(h('tr', {},
    h('td', {}, h('b', { class: 'code' }, r.code), r.priority ? h('span', { class: 'chip chip-lilac tiny', style: { marginLeft: '8px' } }, 'priority') : null, h('div', { class: 'small muted' }, `${r.from} → ${r.to}`)),
    h('td', { class: 'small' }, observed(r.latest_day + 'T12:00:00Z'), h('div', { class: r.stale ? 'chip chip-amber tiny' : 'muted tiny' }, r.age_days ? `${plural(r.age_days, 'day', 'days')} ago` : 'latest day')),
    h('td', {}, h('b', { class: 'num' }, money(r.cheapest_usd, { day: r.latest_day })), h('div', { class: 'small muted' }, `dep ${day(r.cheapest_dep)} · ${r.cheapest_airlines || 'airline n/a'} · ${r.cheapest_stops ? plural(r.cheapest_stops, 'stop', 'stops') : 'nonstop'}`)),
    h('td', {}, trendChip(r.trend)),
    h('td', { class: `spark-cell ${r.trend.status}` }, spark(r)))));
  table.append(body);
  el.append(h('div', { class: 'pulse-scroll' }, table));
  if (rows.length > LIMIT) el.append(h('button', { class: 'btn btn-sm', style: { marginTop: '10px' }, onclick: () => { showAll = !showAll; renderPulse(); } }, showAll ? 'Show fewer routes' : `Show all ${rows.length} routes`));
  el.append(h('p', { class: 'tiny muted', style: { marginTop: '10px' } },
    `Quotes older than ${sm.max_age_days} days are ignored by the studio and flagged here as stale. A trend needs the same departure date quoted on two different days; moves under 3% count as stable.`));
}
