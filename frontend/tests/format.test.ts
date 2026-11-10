import { describe, expect, it } from 'vitest';
import { day, dur, fillMoney, money, range, rateFor, stops, toUsd } from '@/lib/format';
import type { FxTable } from '@/types';

const fx: FxTable = { latest_day: '2026-11-10', latest: { BRL: 5.5, RUB: 82 }, days: { '2026-11-09': { BRL: 5.4, RUB: 81 }, '2026-11-10': { BRL: 5.5, RUB: 82 } } };

describe('currency', () => {
  it('USD is the pivot', () => { expect(money(fx, 100, 'USD')).toBe('$100'); expect(rateFor(fx, 'USD')).toBe(1); });
  it('uses the latest rate for totals and the quote-day rate for a fare', () => {
    expect(money(fx, 100, 'BRL')).toBe('R$ 550');
    expect(money(fx, 100, 'BRL', '2026-11-09')).toBe('R$ 540');
    expect(money(fx, 100, 'RUB', '2026-11-10')).toBe('₽ 8,200');
  });
  it('falls back to the nearest earlier day, then the first known day', () => {
    expect(rateFor(fx, 'BRL', '2026-11-12')).toBe(5.5);
    expect(rateFor(fx, 'BRL', '2026-01-01')).toBe(5.4);
  });
  it('round-trips a budget typed in another currency', () => { expect(toUsd(fx, 550, 'BRL')).toBeCloseTo(100); });
  it('shows a dash instead of NaN', () => { expect(money(fx, null, 'USD')).toBe('—'); expect(money(fx, Number.NaN, 'USD')).toBe('—'); });
  it('fills the server money placeholders in the display currency', () => { expect(fillMoney(fx, 'BRL', 'saves ⟦100⟧')).toBe('saves R$ 550'); });
});

describe('dates and durations', () => {
  it('formats local wall-clock strings without timezone conversion', () => { expect(day('2027-02-11 22:35')).toBe('11 Feb'); });
  it('collapses ranges', () => { expect(range('2027-03-12', '2027-03-16')).toBe('12–16 Mar'); expect(range('2027-03-30', '2027-04-02')).toBe('30 Mar – 2 Apr'); expect(range('2027-03-12', '2027-03-12')).toBe('12 Mar'); });
  it('formats duration and stops', () => { expect(dur(125)).toBe('2h 5m'); expect(dur(45)).toBe('45m'); expect(stops(0)).toBe('Nonstop'); expect(stops(2)).toBe('2 stops'); });
});
