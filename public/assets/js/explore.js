// Exploration drawer. Stage 1: destination cards ("where next?"). Stage 2: the actual flight options for one destination.
import { h, icon, clear, toast } from './ui.js';
import { money, fmtIn, getCurrency, rateFor, day, dayLong, dayTime, time, dur, stops, plural, observed, sourceLabel, range } from './fmt.js';
import { airlineList, airlineLabel, logoStack, airportName, bagChips, stopsText, dayOffset } from './airline.js';
import { S, active, emit, emitLight, evalOf, nodeCity, cityMeta, fetchNext, addChild, projected, setPref, pathNodes } from './store.js';

const RANKINGS = [
  ['cheapest', 'Cheapest'], ['fastest', 'Fastest'], ['best', 'Best overall'], ['interesting', 'Most interesting stopover'], ['lowest_total', 'Lowest total itinerary cost'],
];
let opener = null;

export function openExplore(nodeId, city = null) {
  opener = document.activeElement;
  S.ui.drawer = { nodeId, stage: city ? 'flights' : 'dest', city, date: 'all' };
  const sc = active();
  fetchNext(sc, nodeId).catch((e) => toast(`Could not load options: ${e.message}`));
  const wrap = document.getElementById('drawer-wrap');
  wrap.hidden = false;
  document.body.style.overflow = 'hidden';
  emit();
  setTimeout(() => document.getElementById('drawer').focus(), 0);
}
export function closeExplore() {
  S.ui.drawer = null;
  S.ui.hover = null;
  document.getElementById('drawer-wrap').hidden = true;
  document.body.style.overflow = '';
  if (opener && opener.focus) opener.focus();
  emit();
}
export function setHover(city) { if (S.ui.hover !== city) { S.ui.hover = city; emitLight(); } }

// ---- ranking ----------------------------------------------------------------------------------
function norm(vals) { const lo = Math.min(...vals), hi = Math.max(...vals); return vals.map((v) => (hi === lo ? 0 : (v - lo) / (hi - lo))); }
function rank(groups, mode) {
  const g = [...groups];
  if (mode === 'best') {
    const c = norm(g.map((x) => x.min_cumulative)), d = norm(g.map((x) => x.min_duration_min)), i = norm(g.map((x) => x.interest));
    g.forEach((x, k) => { x._score = 0.45 * c[k] + 0.35 * d[k] + 0.2 * (1 - i[k]); });
  }
  const by = {
    cheapest: (a, b) => a.min_price - b.min_price,
    fastest: (a, b) => a.min_duration_min - b.min_duration_min,
    best: (a, b) => a._score - b._score,
    interesting: (a, b) => b.interest - a.interest || a.min_cumulative - b.min_cumulative,
    lowest_total: (a, b) => a.min_cumulative - b.min_cumulative,
  }[mode];
  return g.sort((a, b) => (b.any_ok - a.any_ok) || by(a, b));
}
const WHY = {
  cheapest: 'Lowest observed fare for this next flight.', fastest: 'Shortest observed flight time.', best: 'Balances accumulated cost (45%), flight time (35%) and your interest score (20%).',
  interesting: 'Ordered by your editable interest scores in config/cities.json.', lowest_total: 'Lowest projected total for the whole itinerary so far, including hotel, baggage and transfer estimates.',
};

// ---- render -----------------------------------------------------------------------------------
export function renderDrawer() {
  const d = S.ui.drawer;
  if (!d) return;
  const sc = active();
  if (!sc.nodes[d.nodeId]) { closeExplore(); return; }
  const node = sc.nodes[d.nodeId];
  const root = document.getElementById('drawer');
  const res = S.next[`${sc.id}:${d.nodeId}`];
  const fromCity = cityMeta(nodeCity(node)), ev = evalOf(sc, d.nodeId), sm = ev && ev.summary;
  clear(root);
  const head = h('div', { class: 'drawer-head' });
  head.append(h('div', { style: { display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'center' } },
    d.stage === 'flights' ? h('button', { class: 'back', onclick: () => { S.ui.drawer.stage = 'dest'; S.ui.hover = null; emit(); } }, icon('back', 16), 'All destinations')
      : h('p', { class: 'eyebrow' }, `From ${fromCity.name}`),
    h('button', { class: 'btn btn-ghost icon-only', 'aria-label': 'Close exploration panel', onclick: closeExplore }, icon('x', 18))));
  root.append(head);
  const body = h('div', { class: 'drawer-body' });
  root.append(body);
  if (!res) { head.append(h('h2', { id: 'drawer-title' }, 'Where could you go next?')); body.append(h('p', { class: 'muted' }, h('span', { class: 'spinner' }), 'Looking through the observed fares…')); return; }

  const group = d.stage === 'flights' ? res.groups.find((g) => g.city === d.city) : null;
  if (d.stage === 'dest') {
    head.append(h('h2', { id: 'drawer-title' }, 'Where could you go next?'),
      h('p', { class: 'small muted', style: { marginTop: '6px' } }, `You would be in ${fromCity.name} from ${dayTime(res.summary.arrive_local)}. ` + (sm ? `So far: ${money(sm.total)} accumulated.` : '')));
    destinations(body, res, sc);
  } else if (group) {
    head.append(h('h2', { id: 'drawer-title' }, group.name), h('p', { class: 'small muted', style: { marginTop: '4px' } }, `${group.country.toUpperCase()} · ${group.tag}`));
    flights(body, group, res, sc, node);
  } else {
    head.append(h('h2', { id: 'drawer-title' }, cityMeta(d.city).name));
    body.append(h('p', { class: 'muted' }, 'No observed flights from here to this city yet.'));
  }
}

const codeOf = (city) => (cityMeta(city).code || city.slice(0, 3));
const routeTag = (a, b, obs) => `${codeOf(a)}_${codeOf(b)} · quoted ${observed(obs)}`;

function destinations(body, res, sc) {
  body.append(
    h('div', {}, h('p', { class: 'eyebrow', style: { marginBottom: '6px' } }, 'Rank by'),
      h('div', { class: 'seg', role: 'group', 'aria-label': 'Ranking mode' }, RANKINGS.map(([k, label]) => h('button', { 'aria-pressed': S.prefs.ranking === k, onclick: () => setPref('ranking', k) }, label))),
      h('p', { class: 'tiny muted', style: { marginTop: '6px' } }, WHY[S.prefs.ranking])),
    h('label', { class: 'switch' }, h('span', {}, 'Strict filtering: hide options that break my rules or the budget'),
      h('input', { type: 'checkbox', checked: S.prefs.strict, onchange: (e) => setPref('strict', e.target.checked) })));
  let groups = res.groups;
  const over = (g) => projected(g.min_cumulative).over;
  if (S.prefs.strict) groups = groups.filter((g) => g.any_ok && !over(g));
  groups = rank(groups, S.prefs.ranking);
  if (!groups.length) { body.append(h('div', { class: 'empty' }, 'Nothing matches the strict filter. Turn it off to see every observed option, or add a fare you know about.', h('div', { style: { marginTop: '10px' } }, h('button', { class: 'btn btn-sm', onclick: () => setPref('strict', false) }, 'Show everything')))); return; }
  groups.forEach((g, i) => {
    const pr = projected(g.min_cumulative);
    const card = h('button', { class: 'dest' + (g.any_ok ? '' : ' dim'), style: { animationDelay: `${Math.min(i, 8) * 35}ms` },
      onclick: () => { Object.assign(S.ui.drawer, { stage: 'flights', city: g.city, date: 'all', sort: 'cheapest', stops: 'any', airline: 'all', carryOnly: false }); emit(); },
      onmouseenter: () => setHover(g.city), onmouseleave: () => setHover(null), onfocus: () => setHover(g.city), onblur: () => setHover(null),
      'aria-label': `${g.name}, from ${money(g.min_price)}. Open flight options.` },
      h('div', { class: 'dest-top' },
        h('div', {}, h('div', { class: 'dest-name' }, g.name, cityMeta(g.city).priority ? h('span', { class: 'chip chip-lilac', style: { marginLeft: '10px', verticalAlign: 'middle' } }, 'Priority') : null), h('div', { class: 'dest-tag' }, `${g.country} · ${g.tag}`), h('div', { class: 'dest-route' }, routeTag(res.summary.city, g.city, g.options[0] && g.options[0].observed_at))),
        h('div', { class: 'dest-from' }, h('div', { class: 'tiny muted' }, 'From'), h('div', { class: 'p num' }, money(g.min_price)))),
      h('div', { class: 'dest-facts' },
        h('span', {}, 'Dates ', h('b', {}, range(g.date_from, g.date_to))),
        h('span', {}, 'Flight ', h('b', {}, `${dur(g.min_duration_min)}`), ' · ', h('b', {}, stops(g.min_stops).toLowerCase())),
        h('span', {}, 'Stay ', h('b', {}, g.stay_days[0] >= 1 ? `${g.stay_days[0]}–${g.stay_days[1]} days` : `up to ${g.stay_days[1]} days`)),
        h('span', {}, `${plural(g.ok_count, 'option', 'options')}${g.blocked_count ? ` · ${g.blocked_count} outside rules` : ''}`)),
      h('div', { class: 'dest-foot' },
        h('span', { class: 'proj' }, 'Projected total ', h('b', { class: 'num' }, money(pr.spent)),
          h('span', { class: pr.over ? 'chip chip-amber' : 'muted small', style: { marginLeft: '8px' } }, pr.over ? `${money(-pr.remaining)} over budget` : `${money(pr.remaining)} left`)),
        h('span', { class: 'btn btn-sm' }, g.any_ok ? 'Explore' : 'See why not', icon('chevron', 14))));
    body.append(card);
  });
}

const SORTS = [['cheapest', 'Cheapest'], ['fastest', 'Fastest'], ['earliest', 'Earliest'], ['fewest', 'Fewest stops']];
const STOPS = [['any', 'Any'], ['0', 'Nonstop'], ['1', '1 stop'], ['2', '2+ stops']];
const seg = (label, items, value, onPick) => h('div', { class: 'ctl' }, h('span', { class: 'eyebrow' }, label),
  h('div', { class: 'seg', role: 'group', 'aria-label': label }, items.map(([k, t]) => h('button', { 'aria-pressed': value === k, onclick: () => onPick(k) }, t))));

function flights(body, g, res, sc, node) {
  const d = S.ui.drawer;
  d.sort = d.sort || 'cheapest'; d.stops = d.stops || 'any'; d.airline = d.airline || 'all';
  const dates = [...new Set(g.options.map((o) => o.dep_local.slice(0, 10)))].sort();
  const airlines = [...new Set(g.options.flatMap((o) => airlineList(o.airlines)))].sort();
  const controls = h('div', { class: 'controls' },
    seg('Sort by', SORTS, d.sort, (k) => { d.sort = k; emit(); }),
    seg('Stops', STOPS, d.stops, (k) => { d.stops = k; emit(); }),
    dates.length > 1 ? seg('Departure', [['all', 'All dates'], ...dates.map((x) => [x, day(x)])], d.date, (k) => { d.date = k; emit(); }) : null,
    airlines.length > 1 ? h('label', { class: 'ctl' }, h('span', { class: 'eyebrow' }, 'Airline'),
      h('select', { onchange: (e) => { d.airline = e.target.value; emit(); } }, [h('option', { value: 'all' }, 'All airlines'), ...airlines.map((a) => h('option', { value: a, selected: d.airline === a }, a))])) : null,
    h('label', { class: 'switch' }, h('span', {}, 'Only fares with a carry-on'), h('input', { type: 'checkbox', checked: !!d.carryOnly, onchange: (e) => { d.carryOnly = e.target.checked; emit(); } })));
  body.append(controls);
  let opts = g.options.filter((o) => (d.date === 'all' || o.dep_local.startsWith(d.date))
    && (d.stops === 'any' || (d.stops === '2' ? o.stops >= 2 : o.stops === Number(d.stops)))
    && (d.airline === 'all' || airlineList(o.airlines).includes(d.airline))
    && (!d.carryOnly || o.baggage.carry_on === 'included'));
  if (S.prefs.strict) opts = opts.filter((o) => o.ok && !projected(o.cumulative).over);
  const key = { cheapest: (a, b) => a.price - b.price || a.duration_min - b.duration_min, fastest: (a, b) => a.duration_min - b.duration_min, earliest: (a, b) => a.dep_local.localeCompare(b.dep_local) || a.price - b.price,
    fewest: (a, b) => a.stops - b.stops || a.price - b.price }[d.sort];
  opts = [...opts].sort((a, b) => (b.ok - a.ok) || key(a, b));
  body.append(h('p', { class: 'tiny muted' }, `${plural(opts.length, 'flight', 'flights')} of ${g.options.length} observed · fares are observed offers from the sources shown, not bookings`));
  if (!opts.length) { body.append(h('div', { class: 'empty' }, 'No flights match these filters.')); return; }
  opts.forEach((o, i) => body.append(flightCard(o, i, sc, node, g)));
}

function quoteNote(o) {
  const q = o.native_currency;
  if (!q) return '';
  const quoted = `Quoted ${fmtIn(o.native_price, q)}`;
  if (q === getCurrency()) return `${quoted} on ${o.fx_day}`;
  return `${quoted} on ${o.fx_day} · 1 USD = ${rateFor(q === 'USD' ? getCurrency() : q, o.fx_day).toFixed(2)} ${q === 'USD' ? getCurrency() : q}`;
}

function flightCard(o, i, sc, node, g) {
  const pr = projected(o.cumulative);
  const fromC = cityMeta(nodeCity(node)), toC = cityMeta(g.city), off = dayOffset(o);
  const timeline = h('div', { class: 'f-tl' },
    h('div', { class: 'f-tl-row' }, h('b', { class: 'num' }, time(o.dep_local)), h('span', {}, h('b', {}, o.origin), ` ${airportName(o.origin)}`, h('span', { class: 'muted' }, ` · ${dayLong(o.dep_local)}`))),
    ...(o.via || []).map((v) => h('div', { class: 'f-tl-row lay' }, h('span', { class: 'num muted' }, v.minutes != null ? dur(v.minutes) : '—'), h('span', {}, 'Layover at ', h('b', {}, v.airport), ` ${airportName(v.airport)}`))),
    o.stops > (o.via || []).length ? h('div', { class: 'f-tl-row lay' }, h('span', {}, ''), h('span', { class: 'muted' }, 'Connection details not recorded for this offer')) : null,
    h('div', { class: 'f-tl-row' }, h('b', { class: 'num' }, time(o.arr_local)), h('span', {}, h('b', {}, o.destination), ` ${airportName(o.destination)}`, h('span', { class: 'muted' }, ` · ${dayLong(o.arr_local)}`))),
    h('div', { class: 'f-tl-meta' }, `Total ${dur(o.duration_min)} · ${o.flights ? 'Flight ' + o.flights + ' · ' : ''}${o.airlines || 'airline not recorded'}`));
  return h('article', { class: 'flight' + (o.ok ? '' : ' bad'), style: { animationDelay: `${Math.min(i, 8) * 30}ms` } },
    h('div', { class: 'f-head' }, logoStack(o.airlines), h('div', {}, h('div', { class: 'f-air' }, airlineLabel(o.airlines)), h('div', { class: 'tiny muted' }, `${fromC.name} → ${toC.name}`), h('div', { class: 'dest-route' }, routeTag(nodeCity(node), g.city, o.observed_at)))),
    h('div', { class: 'f-route' },
      h('div', { class: 'f-end' }, h('div', { class: 't num' }, time(o.dep_local)), h('div', { class: 'ap' }, h('b', {}, o.origin), ' ', airportName(o.origin)), h('div', { class: 'p' }, day(o.dep_local))),
      h('div', { class: 'f-mid' }, h('div', { class: 'dur num' }, dur(o.duration_min)),
        h('div', { class: 'f-line' }, Array.from({ length: o.stops }, (_, k) => h('i', { class: 'stopdot', style: { left: `${((k + 1) / (o.stops + 1)) * 100}%` } }))),
        h('div', { class: 'stops' + (o.stops ? '' : ' direct') }, stopsText(o))),
      h('div', { class: 'f-end r' }, h('div', { class: 't num' }, time(o.arr_local), off ? h('sup', {}, `+${off}`) : null), h('div', { class: 'ap' }, h('b', {}, o.destination), ' ', airportName(o.destination)), h('div', { class: 'p' }, day(o.arr_local)))),
    h('div', { class: 'f-bags' }, bagChips(o.baggage), o.airport_change ? h('span', { class: 'bagchip warn' }, 'Airport change in the same city') : null,
      o.nights_before ? h('span', { class: 'bagchip muted' }, `${plural(o.nights_before, 'night', 'nights')} before this flight`) : null),
    o.ok ? null : h('div', { class: 'warnbox' }, h('b', {}, 'Outside your rules: '), o.why.join(' · ')),
    h('details', { class: 'f-details' }, h('summary', {}, 'Flight details'), timeline,
      h('div', { class: 'f-prov' }, `Source: ${sourceLabel(o.source)} · last verified ${observed(o.observed_at)} · an observed offer, not a booking. Baggage rules vary by fare: confirm on the airline's own site before booking.`)),
    h('div', { class: 'f-price' },
      h('div', {}, h('div', { class: 'p num' }, money(o.price, { day: o.fx_day })), h('div', { class: 'tiny muted' }, quoteNote(o)),
        h('div', { class: 'small' }, 'Journey total ', h('b', { class: 'num' }, money(pr.spent)), ' · ',
          h('span', { style: { color: pr.over ? 'var(--amber)' : 'var(--green)' } }, pr.over ? `${money(-pr.remaining)} over budget` : `${money(pr.remaining)} remaining`))),
      h('button', { class: o.ok ? 'btn btn-primary' : 'btn', onclick: () => add(sc, node, o) }, icon('plus', 16), o.ok ? 'Add to my journey' : 'Add anyway')));
}

function add(sc, node, o) {
  const leg = { key: o.key, origin: o.origin, destination: o.destination, dep_local: o.dep_local, arr_local: o.arr_local, price: o.price, stops: o.stops,
    airlines: o.airlines, flights: o.flights, observed_at: o.observed_at, source: o.source, duration_min: o.duration_min, via: o.via, baggage: o.baggage };
  addChild(sc, node.id, leg, o.ok ? [] : o.why);
  toast(`${cityMeta(nodeCity(node)).name} → ${cityMeta(S.meta.airports[o.destination]).name} added.`);
  closeExplore();
}
