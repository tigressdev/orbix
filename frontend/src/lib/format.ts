import type { Currency, FxTable } from '@/types';

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const NF0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const NF2 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const SYMBOL: Record<Currency, string> = { USD: '$', BRL: 'R$ ', RUB: '₽ ' };

/** Units of `c` per 1 USD on `day` (nearest earlier stored day); the latest rate when no day is given. USD is the central currency. */
export function rateFor(fx: FxTable, c: Currency, day?: string | null): number {
  if (c === 'USD') return 1;
  if (!day) return fx.latest[c] || 1;
  const days = Object.keys(fx.days).filter((d) => fx.days[d]?.[c]).sort();
  const pick = days.filter((d) => d <= day).pop() ?? days[0];
  return pick ? (fx.days[pick]?.[c] ?? 1) : fx.latest[c] || 1;
}
export const fromUsd = (fx: FxTable, usd: number, c: Currency, day?: string | null) => usd * rateFor(fx, c, day);
export const toUsd = (fx: FxTable, amount: number, c: Currency) => amount / rateFor(fx, c);
export const fmtAmount = (v: number, c: Currency, decimals = 0) => `${SYMBOL[c]}${(decimals ? NF2 : NF0).format(decimals ? v : Math.round(v))}`;
export function money(fx: FxTable, usd: number | null | undefined, c: Currency, day?: string | null): string {
  return usd == null || Number.isNaN(usd) ? '—' : fmtAmount(fromUsd(fx, usd, c, day), c);
}

type Parts = { y: number; m: number; d: number; t: string };
const parts = (s: string): Parts => {
  const [d = '', t = '00:00'] = s.split(/[ T]/);
  const [y = 0, m = 1, dd = 1] = d.split('-').map(Number);
  return { y, m, d: dd, t };
};
export const day = (s: string) => { const p = parts(s); return `${p.d} ${MON[p.m - 1]}`; };
export const time = (s: string) => parts(s).t;
export const dateOnly = (s: string) => s.slice(0, 10);
const asDate = (s: string) => { const p = parts(s); return Date.UTC(p.y, p.m - 1, p.d); };
export const daysBetween = (a: string, b: string) => Math.round((asDate(b) - asDate(a)) / 86400000);
export function range(a: string, b?: string | null) {
  if (!b) return `${day(a)} →`;
  const pa = parts(a), pb = parts(b);
  if (pa.m === pb.m && pa.d === pb.d) return day(a);
  if (pa.m === pb.m) return `${pa.d}–${pb.d} ${MON[pa.m - 1]}`;
  return `${day(a)} – ${day(b)}`;
}
export const dur = (min: number) => { const h = Math.floor(min / 60), m = Math.round(min % 60); return h ? `${h}h${m ? ` ${m}m` : ''}` : `${m}m`; };
export const stops = (n: number) => (n === 0 ? 'Nonstop' : n === 1 ? '1 stop' : `${n} stops`);
export const plural = (n: number, a: string, b: string) => `${n} ${n === 1 ? a : b}`;
export function observed(iso?: string) {
  if (!iso) return 'unknown date';
  const d = new Date(iso);
  return `${d.getUTCDate()} ${MON[d.getUTCMonth()]}`;
}
export const SOURCES: Record<string, string> = { browser: 'Google Flights (manual read)', serpapi: 'SerpApi · Google Flights', manual: 'Entered by you', config: 'Entered by you', fixture: 'Synthetic demo data' };
export const sourceLabel = (s?: string) => (s && SOURCES[s]) || s || 'unknown source';
/** Replaces the server's ⟦amount⟧ placeholders (USD) with the amount in the display currency. */
export const fillMoney = (fx: FxTable, c: Currency, text: string) => String(text).replace(/⟦(-?[\d.]+)⟧/g, (_, v) => money(fx, Number(v), c));
