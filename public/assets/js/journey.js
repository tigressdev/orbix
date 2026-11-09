// Journey View: the focused branch as a sequence of travel chapters.
import { h, icon, clear } from './ui.js';
import { money, fromUsd, toUsd, getCurrency, day, dayTime, time, range, daysBetween, dur, stops, plural, observed, sourceLabel } from './fmt.js';
import { S, active, evalOf, nodeCity, cityMeta, pathNodes, hotelRate, hotelFullRate, hotelSplit, otherTraveller, setHotel, setNote, removeNode, togglePin, isPinned, toggleSaved, branchToScenario } from './store.js';
import { openExplore } from './explore.js';
import { logoStack, airlineLabel, airportName, bagChips, stopsText } from './airline.js';
import { toast } from './ui.js';

export function renderJourney(el) {
  const sc = active();
  const nodes = pathNodes(sc, sc.focusId);
  const last = nodes[nodes.length - 1];
  const evLast = evalOf(sc, last.id);
  const sm = evLast && evLast.summary;
  const complete = !!(sm && sm.complete);
  clear(el);

  el.append(h('div', { class: 'journey-head' },
    h('div', {}, h('p', { class: 'eyebrow' }, 'Journey view'), h('h2', {}, complete ? 'A complete journey' : 'Your journey so far'),
      h('p', { class: 'muted small' }, complete ? 'Madrid → … → Madrid, every mandatory destination included.' : sm && sm.missing_required.length ? `Still to include: ${sm.missing_required.map((c) => cityMeta(c).name).join(', ')}.` : 'Keep exploring from the last chapter.')),
    h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
      h('button', { class: 'btn btn-sm', onclick: () => toggleSaved(sc) }, icon('star', 14), sc.saved ? 'Saved' : 'Save scenario'),
      h('button', { class: 'btn btn-sm', onclick: () => { branchToScenario(sc, last.id); toast('Branch copied into its own scenario.'); } }, icon('copy', 14), 'Duplicate branch'),
      h('button', { class: 'btn btn-sm', onclick: () => { const ok = togglePin(sc, last.id); if (!ok) toast('You can compare up to four branches.'); else toast(isPinned(sc, last.id) ? 'Pinned for comparison.' : 'Removed from comparison.'); } }, icon('compare', 14), isPinned(sc, last.id) ? 'Unpin from compare' : 'Pin to compare'))));

  const tl = h('div', { class: 'timeline' });
  nodes.forEach((n, i) => tl.append(chapter(sc, n, nodes[i + 1], i, last === n)));

  if (!complete) {
    tl.append(h('div', { class: 'chapter' },
      h('div', { class: 'rail' }, h('span', { class: 'node open' }), h('span', { class: 'line dash' })),
      h('button', { class: 'explore-plus', onclick: () => openExplore(last.id) }, h('span', { class: 'pl' }, '+'),
        h('span', {}, `Explore next destination from ${cityMeta(nodeCity(last)).name}`,
          h('span', { class: 'small muted', style: { display: 'block', fontWeight: 400 } }, 'Discover where the observed fares take you next.')))));
  }
  const ret = S.meta.bookings[1];
  tl.append(h('div', { class: 'chapter' },
    h('div', { class: 'rail' }, h('span', { class: 'node confirmed' })),
    h('div', { class: 'chap-card' },
      h('div', { class: 'chap-top' }, h('div', {}, h('p', { class: 'eyebrow' }, 'Return flight'), h('div', { class: 'chap-city' }, 'Madrid → São Paulo'), h('div', { class: 'chap-country' }, 'Spain → Brazil')),
        h('div', {}, h('span', { class: 'chip chip-teal' }, 'Confirmed'), h('div', { class: 'chap-dates', style: { marginTop: '6px', textAlign: 'right' } }, day(ret.dep_local)))),
      h('div', { class: 'chap-transport' }, h('div', {}, `${ret.flight} · ${ret.airline} · departs ${dayTime(ret.dep_local)}, lands ${dayTime(ret.arr_local)}`),
        h('div', { class: 'muted small' }, `Be in Madrid by ${dayTime(S.meta.latest_arrival_local)} at the latest (6h before departure). Not endorsable, penalties apply.`)),
      sm ? h('p', { class: 'small muted', style: { marginTop: '10px' } }, sm.slack_hours_to_return >= 0 ? `This branch leaves ${(sm.slack_hours_to_return / 24).toFixed(1)} days of slack before that deadline.` : 'This branch misses the return flight.') : null)));
  el.append(tl);
}

function chapter(sc, n, next, i, isLast) {
  const city = nodeCity(n), m = cityMeta(city), root = !n.leg;
  const arr = root ? S.meta.bookings[0].arr_local : n.leg.arr_local;
  const dep = next ? next.leg.dep_local : null;
  const nights = dep ? daysBetween(arr, dep) : null;
  const rate = hotelRate(city);
  const split = S.hotel[city] == null ? hotelSplit(city) : 1;
  const hosted = !!(S.meta.lodging && S.meta.lodging.hosted && S.meta.lodging.hosted[city] && S.hotel[city] == null);
  const bd = S.meta.birthday.date;
  const covers = bd && dep && arr.slice(0, 10) <= bd && bd <= dep.slice(0, 10);
  const ev = evalOf(sc, n.id);
  const card = h('div', { class: 'chap-card' + (n.id === sc.focusId ? ' focus' : '') });
  card.append(h('div', { class: 'chap-top' },
    h('div', {}, h('p', { class: 'eyebrow' }, root ? 'Arrival' : `Chapter ${i}`), h('div', { class: 'chap-city' }, m.name), h('div', { class: 'chap-country' }, `${m.country.toUpperCase()} · ${m.tag}`)),
    h('div', { style: { textAlign: 'right' } },
      h('div', { class: 'chap-dates' }, range(arr, dep)),
      h('div', { class: 'small muted' }, nights != null ? plural(nights, 'night', 'nights') : 'open-ended'),
      h('div', { style: { marginTop: '6px', display: 'flex', gap: '6px', justifyContent: 'flex-end', flexWrap: 'wrap' } },
        root ? h('span', { class: 'chip chip-teal' }, 'Confirmed arrival') : h('span', { class: 'chip chip-teal' }, 'Selected'),
        root ? null : h('span', { class: 'chip chip-blue' }, 'Observed fare'),
        nights ? h('span', { class: 'chip' }, hosted ? 'Hosted · no lodging cost' : split > 1 ? `Shared with ${otherTraveller()} · you pay half` : 'Estimated stay') : null))));
  if (root) {
    card.append(h('div', { class: 'chap-transport' }, h('div', {}, `${S.meta.bookings[0].flight} · ${S.meta.bookings[0].airline} · São Paulo ${dayTime(S.meta.bookings[0].dep_local)} → Madrid ${dayTime(S.meta.bookings[0].arr_local)}`),
      h('div', { class: 'muted small' }, 'Purchased ticket. Landing at night: your first flight out should leave the next morning or later.')));
  } else {
    const l = n.leg;
    card.append(h('div', { class: 'chap-transport' },
      h('div', { class: 'ct-head' }, logoStack(l.airlines, 28), h('div', {}, h('b', {}, airlineLabel(l.airlines)), h('div', { class: 'small muted' }, `${stopsText(l)} · ${dur(l.duration_min)}`))),
      h('div', {}, h('b', {}, `${l.origin} ${dayTime(l.dep_local)}`), ' → ', h('b', {}, `${l.destination} ${dayTime(l.arr_local)}`)),
      h('div', { class: 'small muted' }, `${airportName(l.origin)} → ${airportName(l.destination)}`),
      h('div', { class: 'f-bags' }, bagChips(l.baggage)),
      h('div', { class: 'muted tiny' }, `${sourceLabel(l.source)} · observed ${observed(l.observed_at)}`)));
    if (n.warn && n.warn.length) card.append(h('div', { class: 'warnbox' }, `Added despite: ${n.warn.join(' · ')}`));
  }
  const costs = h('div', { class: 'chap-costs' });
  if (!root) costs.append(h('span', {}, 'Fare ', h('b', { class: 'num' }, money(n.leg.price)), ' (observed)'));
  if (nights) costs.append(hosted ? h('span', {}, `Stay ${plural(nights, 'night', 'nights')} · `, h('b', {}, 'hosted, no lodging cost'), ' (rule)') : split > 1 ? h('span', {}, `Stay ${plural(nights, 'night', 'nights')} × ${money(hotelFullRate(city))} room ÷ ${split} = `, h('b', { class: 'num' }, money(nights * rate)), ` (your half; split with ${otherTraveller()})`) : h('span', {}, `Stay ${plural(nights, 'night', 'nights')} × ${money(rate)} = `, h('b', { class: 'num' }, money(nights * rate)), ' (estimate)'));
  if (!root) costs.append(h('span', {}, 'Baggage ', h('b', { class: 'num' }, money(S.meta.costs.bag)), ' · transfer ', h('b', { class: 'num' }, money(S.meta.costs.transfer)), ' (estimates)'));
  if (ev && ev.summary) costs.append(h('span', {}, 'Accumulated ', h('b', { class: 'num' }, money(ev.summary.total))));
  card.append(costs);

  if (covers) {
    const b = ev && ev.metrics && ev.metrics.birthday;
    card.append(h('div', { class: 'bday' }, `Birthday here · ${day(bd)}. ` + (m.birthday ? m.birthday + '.' : 'A stay, not a transit day.')));
  }
  card.append(h('div', { class: 'chap-edit' },
    h('label', { class: 'field' }, `Hotel / night in ${m.name} (${getCurrency()}, what you pay${split > 1 ? ' · half of the room' : ''})`,
      h('input', { type: 'number', min: 0, step: 5, value: Math.round(fromUsd(rate)), 'aria-label': `Hotel estimate per night in ${m.name}`, onchange: (e) => setHotel(city, toUsd(Number(e.target.value) || 0)) })),
    h('label', { class: 'field', style: { flex: 1 } }, 'Notes',
      h('textarea', { rows: 1, placeholder: 'Ideas, bookings to check, people to meet…', onchange: (e) => setNote(sc, n.id, e.target.value) }, n.note || ''))));
  const actions = h('div', { class: 'chap-actions' },
    h('button', { class: 'btn btn-sm', onclick: () => openExplore(n.id) }, icon('plus', 14), isLast ? 'Explore next destination' : 'Branch from here'));
  if (!root) actions.append(h('button', { class: 'btn btn-sm btn-ghost', onclick: () => { removeNode(sc, n.id); toast('Segment removed.', { action: 'Undo', onAction: () => import('./store.js').then((x) => x.undoRemove()) }); } }, icon('x', 14), 'Remove from here'));
  card.append(actions);

  return h('div', { class: 'chapter', style: { animationDelay: `${Math.min(i, 8) * 40}ms` } },
    h('div', { class: 'rail' }, h('span', { class: 'node' + (root ? ' confirmed' : '') }), h('span', { class: 'line' })), card);
}
