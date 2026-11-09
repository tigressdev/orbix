// Insights: analytical highlights derived from observed offers. Observed data and analysis are labelled apart.
import { h, clear, toast, openDialog } from './ui.js';
import { api } from './api.js';
import { money, fillMoney, observed, plural, sourceLabel } from './fmt.js';
import { S, loadTrip } from './store.js';
import { quoteDialog } from './quote.js';

let data = null, timer = null, host = null, onOpen = null;

export function renderInsights(el, openInStudio) {
  host = el;
  onOpen = openInStudio;
  draw();
  load();
}
async function load() {
  clearTimeout(timer);
  try { data = await api.get('/api/analysis'); } catch (e) { data = { status: 'error', error: e.message }; }
  if (host && host.isConnected) draw();
  if (data.status === 'computing' && host && host.isConnected) timer = setTimeout(load, 1500);
}
export function stopInsights() { clearTimeout(timer); host = null; }

function draw() {
  if (!host) return;
  clear(host);
  host.append(h('div', { class: 'journey-head' }, h('div', {}, h('p', { class: 'eyebrow' }, 'Insights'), h('h2', { class: 'serif', style: { fontSize: '38px', lineHeight: 1.05 } }, 'Why a route is worth it'),
    h('p', { class: 'muted small' }, 'Everything below is computed from the observed offers in your database. It is analysis, not a forecast.'))));
  if (!data || data.status === 'computing') { host.append(h('div', { class: 'card' }, h('span', { class: 'spinner' }), 'Analysing every complete itinerary in the observed data…')); return; }
  if (data.status === 'error') { host.append(h('div', { class: 'card' }, `Analysis failed: ${data.error}`)); return; }
  const root = h('div', { class: 'insights' });
  host.append(root);

  if (!data.highlights.length) root.append(h('div', { class: 'empty' }, 'No complete itinerary exists in the observed data yet. Explore the tree, or add the missing fares below.'));
  else {
    root.append(h('div', { class: 'hl-grid' }, data.highlights.map((hl) => highlight(hl))));
    root.append(h('p', { class: 'tiny muted' }, `${plural(data.complete_count, 'complete itinerary', 'complete itineraries')} analysed (best per route sequence). Computed ${observed(data.generated_at)}.`));
  }

  if (data.stopover_economics.length) {
    const rows = data.stopover_economics.slice(0, 12), max = Math.max(...rows.map((r) => r.adjusted)), min = rows[0].adjusted;
    root.append(h('section', { class: 'card' },
      h('div', { class: 'section-title' }, h('h3', {}, 'Does a European stopover pay?'), h('span', { class: 'small muted' }, 'Madrid → [stopover] → Beijing')),
      h('p', { class: 'small muted', style: { marginBottom: '12px' } }, 'Flights plus hotel, baggage and transfer estimates until you land in Beijing. Each bar is the cheapest observed combination for that stopover and number of nights.'),
      h('div', { class: 'bars' }, rows.map((r, i) => h('div', { class: 'bar-row' },
        h('span', {}, r.stopover + (r.stop_nights ? ` · ${plural(r.stop_nights, 'night', 'nights')}` : '')),
        h('div', { class: 'bar-track', title: `Flights ${money(r.flights)} · hotel ${money(r.hotel)}` }, h('i', { class: i === 0 ? 'best' : '', style: { width: `${(r.adjusted / max) * 100}%` } })),
        h('span', { class: 'num small' }, money(r.adjusted), i ? h('span', { class: 'muted' }, ` +${money(r.adjusted - min)}`) : null))))));
  }

  const gaps = h('section', { class: 'card' }, h('div', { class: 'section-title' }, h('h3', {}, 'Data and gaps'), h('span', { class: 'small muted' }, 'Provenance')));
  gaps.append(h('div', { class: 'rows' }, S.meta.data.map((d) => h('div', { class: 'row' }, h('span', { class: 'k' }, sourceLabel(d.p)), h('span', { class: 'v small' }, `${d.offers} offers · ${d.searches} searches · last ${observed(d.last)}`)))));
  if (data.gaps.length) gaps.append(h('div', { class: 'note', style: { marginTop: '12px' } }, 'No observed fares yet for: ' + data.gaps.map((g) => g.name).join(', ') + '. They cannot appear in routes until you add fares (or run the search for them).',
    h('div', { style: { marginTop: '8px' } }, h('button', { class: 'btn btn-sm', onclick: () => quoteDialog() }, 'Add an observed fare'))));
  gaps.append(h('details', { style: { marginTop: '12px' } }, h('summary', { class: 'small' }, 'Fare coverage by city pair'),
    h('div', { class: 'rows small', style: { marginTop: '8px' } }, data.coverage.map((c) => h('div', { class: 'row' }, h('span', {}, `${c.from} → ${c.to}`), h('span', { class: 'num' }, `${c.offers} offers · from ${money(c.min_price)}`))))));
  root.append(gaps);
}

function highlight(hl) {
  const t = hl.trip, s2 = t.summary, m = t.metrics;
  return h('article', { class: 'card hl' },
    h('div', {}, h('h3', {}, hl.title), h('p', { class: 'small muted', style: { marginTop: '4px' } }, fillMoney(hl.subtitle))),
    h('div', { class: 'route-line' }, ['Madrid', ...t.cities, 'Madrid'].flatMap((c, i) => (i ? [h('span', { class: 'arr' }, '→'), h('b', {}, c)] : [h('b', {}, c)]))),
    h('div', { class: 'stat-row' },
      stat(money(s2.total), 'Total (est.)'), stat(money(s2.flights), 'Flights'), stat(`${m.flight_hours}h`, 'In the air'), stat(`${m.nights_china}/${m.nights_russia}`, 'Nights China / Russia')),
    h('ul', {}, hl.reasons.map((r) => h('li', {}, fillMoney(r)))),
    h('div', {}, h('button', { class: 'btn btn-sm', onclick: () => { loadTrip(hl.title, t.legs); onOpen && onOpen(); toast(`“${hl.title}” opened as a scenario.`); } }, 'Open in the studio')));
}
const stat = (v, l) => h('div', { class: 'stat' }, h('div', { class: 'v num' }, v), h('div', { class: 'l' }, l));
