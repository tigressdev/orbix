// Airline logos, airport names and baggage labels shared by the flight cards and the journey view.
import { h } from './ui.js';
import { S } from './store.js';
import { dur, daysBetween } from './fmt.js';

export const airlineList = (text) => (text || '').split(',').map((x) => x.trim()).filter(Boolean);
export const iata = (name) => (S.meta.airlines || {})[name] || null;
export const airportName = (code) => (S.meta.airport_names || {})[code] || code;
export const cityName = (code) => (S.meta.cities[S.meta.airports[code]] || {}).name || code;

/** Logo from the public airline-logo CDN used by Google Flights; falls back to a monogram if it cannot load. */
export function logo(name, size = 36) {
  const code = iata(name);
  const wrap = h('span', { class: 'alogo', style: { width: `${size}px`, height: `${size}px` }, title: name });
  const mono = () => wrap.replaceChildren(h('span', { class: 'mono' }, (code || name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2)).toUpperCase()));
  if (!code) { mono(); return wrap; }
  const img = h('img', { src: `https://www.gstatic.com/flights/airline_logos/70px/${code}.png`, alt: '', width: size, height: size, loading: 'lazy', referrerpolicy: 'no-referrer' });
  img.addEventListener('error', mono);
  wrap.append(img);
  return wrap;
}
export function logoStack(text, size = 34) {
  const names = airlineList(text);
  if (!names.length) return h('span', { class: 'alogo', title: 'Airline not recorded' }, h('span', { class: 'mono' }, '?'));
  return h('span', { class: 'alogos' }, names.slice(0, 3).map((n) => logo(n, size)));
}
export const airlineLabel = (text) => airlineList(text).join(' · ') || 'Airline not recorded';

// ---- baggage ---------------------------------------------------------------------------------
const CARRY = {
  included: ['Carry-on included', 'ok', 'The source shows no overhead-bin restriction for this fare.'],
  not_included: ['No carry-on in this fare', 'warn', 'The source says this price does not include overhead-bin access.'],
  unknown: ['Carry-on: unknown', 'muted', 'Not in the source data.'],
};
const CHECKED = {
  included: ['Checked bag included', 'ok', ''],
  fee: ['Checked bag for a fee', 'warn', 'A checked bag costs extra; the budget includes an estimate.'],
  not_included: ['No checked bag', 'warn', ''],
  unknown: ['Checked bag: not in source data', 'muted', 'The source did not list checked-bag rules; the budget includes an estimate.'],
};
export function bagChips(b = {}) {
  const c = CARRY[b.carry_on] || CARRY.unknown, k = CHECKED[b.checked] || CHECKED.unknown;
  return [
    h('span', { class: `bagchip ${c[1]}`, title: c[2] }, bagIcon(), c[0]),
    h('span', { class: `bagchip ${k[1]}`, title: k[2] }, suitcaseIcon(), k[0]),
  ];
}
function svg(path) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', 14); s.setAttribute('height', 14); s.setAttribute('class', 'ico');
  s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', 1.8); s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', path); s.append(p);
  return s;
}
const bagIcon = () => svg('M8 8V6a4 4 0 018 0v2M5 8h14l-1 12H6z');          // small bag
const suitcaseIcon = () => svg('M7 7h10a2 2 0 012 2v9a2 2 0 01-2 2H7a2 2 0 01-2-2V9a2 2 0 012-2zM9 7V5h6v2M9 11v6M15 11v6');

// ---- stops / connections text ------------------------------------------------------------------
export function stopsText(o) {
  if (!o.stops) return 'Nonstop';
  const head = o.stops === 1 ? '1 stop' : `${o.stops} stops`;
  if (!o.via || !o.via.length) return `${head} · connection not recorded`;
  return `${head} · ${o.via.map((v) => `${v.minutes != null ? dur(v.minutes) + ' ' : ''}${v.airport}`).join(', ')}`;
}
export const dayOffset = (o) => daysBetween(o.dep_local, o.arr_local);
