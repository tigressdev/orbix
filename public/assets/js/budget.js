// Persistent budget summary + exploration history.
import { h, icon, clear } from './ui.js';
import { plural, money, money2, fromUsd, toUsd, getCurrency, fmtIn2, getFx, rateLine } from './fmt.js';
import { S, active, evalOf, nodeCity, cityMeta, pathNodes, purchased, setPref, undoRemove, otherTraveller } from './store.js';

export function renderBudget(el) {
  const sc = active();
  const ev = evalOf(sc, sc.focusId);
  const sm = ev && ev.summary;
  const meta = S.meta, budget = S.prefs.budget;
  const label = pathNodes(sc, sc.focusId).map((n) => cityMeta(nodeCity(n)).name).join(' › ');
  clear(el);
  el.append(h('div', { class: 'cur-row' }, h('span', { class: 'eyebrow' }, 'Show prices in'),
    h('div', { class: 'seg cur', role: 'group', 'aria-label': 'Currency' }, ['USD', 'BRL', 'RUB'].map((c) => h('button', { 'aria-pressed': S.prefs.currency === c, onclick: () => setPref('currency', c) }, c)))),
    h('p', { class: 'eyebrow', style: { marginTop: '12px' } }, 'Current itinerary'), h('p', { class: 'small muted', style: { marginTop: '2px' } }, label));
  if (!sm) { el.append(h('p', { class: 'muted small', style: { marginTop: '12px' } }, h('span', { class: 'spinner' }), 'Calculating…')); return; }
  const confirmed = purchased();
  const spent = sm.total + confirmed, remaining = budget - spent, pct = budget ? (spent / budget) * 100 : 0;
  const w = (v) => `${Math.min(100, budget ? (v / budget) * 100 : 0)}%`;
  el.append(
    h('div', { class: 'big num' }, money(spent), h('small', {}, `of ${money(budget)}`)),
    h('div', { class: 'meter' + (remaining < 0 ? ' over' : ''), role: 'img', 'aria-label': `${pct.toFixed(0)}% of the budget used` },
      h('i', { class: 'm-flights', style: { width: w(sm.flights) } }), h('i', { class: 'm-hotel', style: { width: w(sm.hotel) } }),
      h('i', { class: 'm-bags', style: { width: w(sm.bags) } }), h('i', { class: 'm-xfer', style: { width: w(sm.transfers) } })),
    h('div', { class: 'rows' },
      row('m-flights', 'Flights', 'observed', sm.flights), row('m-hotel', 'Accommodation', sm.hotel_shared_nights ? 'estimated · your half in China' : 'estimated', sm.hotel),
      row('m-bags', 'Baggage', 'estimated', sm.bags), row('m-xfer', 'Transfers', 'estimated', sm.transfers),
      confirmed ? h('div', { class: 'row' }, h('span', { class: 'k' }, h('i', { class: 'sw', style: { background: 'var(--ink)' } }), 'Purchased ticket', h('span', { class: 'chip chip-teal tiny' }, 'confirmed')), h('span', { class: 'v num' }, money(confirmed))) : null,
      h('div', { class: 'row total' }, h('span', {}, 'Total'), h('span', { class: 'num' }, money(spent))),
      h('div', { class: 'row' }, h('span', { class: 'k' }, 'Remaining'), h('span', { class: 'v num ' + (remaining < 0 ? 'warn' : 'good') }, remaining < 0 ? `${money(-remaining)} over` : money(remaining))),
      h('div', { class: 'row' }, h('span', { class: 'k' }, 'Budget used'), h('span', { class: 'v num' }, `${pct.toFixed(0)}%`))),
    sm.hotel_shared_nights ? h('div', { class: 'split-note' }, h('b', {}, 'China stays are split in two. '), `You and ${otherTraveller()} share each room, so you pay half: ${money(sm.hotel)} here instead of ${money(sm.hotel_full)} for the rooms (${plural(sm.hotel_shared_nights, 'night', 'nights')} split, saving ${money(sm.hotel_saved)}).`) : null,
    h('p', { class: 'tiny muted', style: { marginTop: '8px' } }, `Observed ${money(sm.flights)} · estimated ${money(sm.hotel + sm.bags + sm.transfers)}`
      + (sm.risk ? ` · connection-risk allowance ${money(sm.risk)} used only for ranking` : '')),
    h('div', { style: { marginTop: '12px' } }, h('span', { class: 'eyebrow' }, 'Accommodation estimate'),
      h('div', { class: 'seg', role: 'group', 'aria-label': 'Accommodation level', style: { marginTop: '6px' } },
        [['hostel', 'Hostel'], ['budget', 'Budget hotel'], ['mid', 'Mid-range']].map(([k, label]) => h('button', { 'aria-pressed': S.prefs.lodging === k, onclick: () => setPref('lodging', k) }, label))),
      h('p', { class: 'tiny muted', style: { marginTop: '6px' } }, 'Per night from public travel-cost guides (not live hotel prices). Private rooms in China are split in two; Moscow is free (hosted). Edit any city in its journey chapter.')),
    h('div', { style: { marginTop: '14px', display: 'grid', gap: '8px' } },
      h('label', { class: 'field' }, `Remaining-trip budget (${getCurrency()})`,
        h('input', { type: 'number', min: 0, step: 100, value: Math.round(fromUsd(budget)), 'aria-label': `Budget in ${getCurrency()}`, onchange: (e) => setPref('budget', Math.max(0, toUsd(Number(e.target.value) || 0))) })),
      h('label', { class: 'switch' }, h('span', {}, `Include the purchased ticket (${money2(meta.purchased_ticket.total_usd || 0)})`),
        h('input', { type: 'checkbox', checked: S.prefs.includePurchased, onchange: (e) => setPref('includePurchased', e.target.checked) })),
      h('label', { class: 'switch' }, h('span', {}, `Protect birthday (${meta.birthday.date ? meta.birthday.date.slice(5).replace('-', '/') : 'Mar 14'}) from travel`),
        h('input', { type: 'checkbox', checked: S.prefs.protectBirthday, onchange: (e) => setPref('protectBirthday', e.target.checked) }))),
    h('p', { class: 'tiny muted', style: { marginTop: '10px' } }, `The purchased São Paulo–Madrid–São Paulo ticket (paid ${fmtIn2(meta.purchased_ticket.total_brl || 0, 'BRL')}, about ${money2(meta.purchased_ticket.total_usd || 0)}) is a confirmed expense, kept apart from this budget unless included.`),
    h('p', { class: 'tiny muted', style: { marginTop: '6px' } }, `Exchange rates (${getFx().latest_day || 'n/a'}): ${rateLine()}. Each flight is converted with the rate of the day it was quoted. Totals use the latest rate.`));
}

function row(cls, name, kind, value) {
  return h('div', { class: 'row' }, h('span', { class: 'k' }, h('i', { class: `sw ${cls}`, style: { background: { 'm-flights': 'var(--teal)', 'm-hotel': 'var(--blue)', 'm-bags': '#c8b98f', 'm-xfer': '#a9b6a3' }[cls] } }), name, h('span', { class: 'tiny muted' }, `· ${kind}`)), h('span', { class: 'v num' }, money(value)));
}

export function renderHistory(el) {
  clear(el);
  el.append(h('div', { class: 'section-title' }, h('h3', {}, 'History'), S.undo ? h('button', { class: 'btn btn-sm', onclick: undoRemove }, icon('undo', 14), 'Undo removal') : null));
  const items = S.history.slice(-8).reverse();
  if (!items.length) { el.append(h('p', { class: 'small muted' }, 'Your exploration steps will appear here.')); return; }
  el.append(h('ul', {}, items.map((e) => h('li', {}, h('time', {}, new Date(e.t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })), h('span', {}, e.text)))));
}
