// Formatting helpers. Dates arrive as local wall-clock strings: "YYYY-MM-DD HH:MM" (never timezone-converted).
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const NF = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const NF2 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const SYMBOL = { USD: '$', BRL: 'R$ ', RUB: '₽ ' };

// USD is the central currency. Amounts arrive in USD; the display currency and the exchange rates are set once at boot.
let CUR = 'USD', FX = { latest: { USD: 1 }, days: {}, latest_day: null };
export const setCurrency = (c) => { CUR = c; };
export const getCurrency = () => CUR;
export const setFx = (fx) => { FX = fx; };
export const getFx = () => FX;
/** Units of `c` per 1 USD on `day` (nearest earlier stored day); the latest rate when no day is given. */
export function rateFor(c, day) {
  if (c === 'USD') return 1;
  if (!day) return FX.latest[c] || 1;
  const days = Object.keys(FX.days).filter((d) => FX.days[d][c]).sort();
  const pick = days.filter((d) => d <= day).pop() || days[0];
  return pick ? FX.days[pick][c] : FX.latest[c] || 1;
}
export const fromUsd = (usd, c = CUR, day = null) => usd * rateFor(c, day);
export const toUsd = (amount, c = CUR) => amount / rateFor(c);
export const fmtIn = (v, c) => `${SYMBOL[c] || ''}${NF.format(Math.round(v))}`;
export const fmtIn2 = (v, c) => `${SYMBOL[c] || ''}${NF2.format(v)}`;
/** USD amount -> display currency. Pass {day} to convert with the rate of the day the price was quoted. */
export const money = (usd, o) => (usd == null || Number.isNaN(usd) ? '—' : fmtIn(fromUsd(usd, CUR, o && o.day), CUR));
export const money2 = (usd, o) => fmtIn2(fromUsd(usd, CUR, o && o.day), CUR);
/** Replaces the server's ⟦amount⟧ placeholders (USD) with the amount in the display currency. */
export const fillMoney = (text) => String(text).replace(/\u27e6(-?[\d.]+)\u27e7/g, (_, v) => money(Number(v)));
export const rateLine = () => {
  const l = FX.latest || {};
  return `1 USD = ${NF2.format(l.BRL || 0)} BRL · ${NF2.format(l.RUB || 0)} RUB`;
};
const parts = (s) => { const [d, t = '00:00'] = s.split(/[ T]/); const [y, m, dd] = d.split('-').map(Number); return { y, m, d: dd, t }; };
export const day = (s) => { const p = parts(s); return `${p.d} ${MON[p.m - 1]}`; };
export const dayLong = (s) => { const p = parts(s); return `${p.d} ${MON[p.m - 1]} ${p.y}`; };
export const time = (s) => parts(s).t;
export const dayTime = (s) => `${day(s)} · ${time(s)}`;
export const dateOnly = (s) => s.slice(0, 10);
const asDate = (s) => { const p = parts(s); return Date.UTC(p.y, p.m - 1, p.d); };
export const daysBetween = (a, b) => Math.round((asDate(b) - asDate(a)) / 86400000);
export function range(a, b) {
  if (!b) return `${day(a)} →`;
  const pa = parts(a), pb = parts(b);
  if (pa.m === pb.m && pa.d === pb.d) return day(a);
  if (pa.m === pb.m) return `${pa.d}–${pb.d} ${MON[pa.m - 1]}`;
  return `${day(a)} – ${day(b)}`;
}
export const dur = (min) => { const h = Math.floor(min / 60), m = Math.round(min % 60); return h ? `${h}h${m ? ` ${m}m` : ''}` : `${m}m`; };
export const stops = (n) => (n === 0 ? 'Nonstop' : n === 1 ? '1 stop' : `${n} stops`);
export const plural = (n, a, b) => `${n} ${n === 1 ? a : b}`;
export function observed(iso) {
  if (!iso) return 'unknown date';
  const d = new Date(iso);
  return `${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
export const SOURCES = { browser: 'Google Flights (manual read)', serpapi: 'SerpApi · Google Flights', manual: 'Entered by you', config: 'Entered by you', fixture: 'Synthetic demo data' };
export const sourceLabel = (s) => SOURCES[s] || s || 'unknown source';
