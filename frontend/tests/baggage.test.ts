import { describe, expect, it } from 'vitest';
import { checkedBag } from '@/lib/baggage';

describe('checked baggage', () => {
  it('an observed value always wins', () => { expect(checkedBag('Ryanair', 'included').status).toBe('included'); });
  it('Royal Air Maroc is shown as usually included, labelled as typical', () => {
    const b = checkedBag('Royal Air Maroc', 'unknown');
    expect(b.status).toBe('typical-included');
    expect(b.hint).toMatch(/not read from this fare/);
  });
  it('low-cost brands are usually extra; legacy light fares depend on the fare', () => {
    expect(checkedBag('Pegasus', 'unknown').status).toBe('typical-extra');
    expect(checkedBag('Air France, KLM', 'unknown').status).toBe('varies');
  });
  it('a mixed itinerary is only "included" when every airline is', () => {
    expect(checkedBag('Air China, Lufthansa', 'unknown').status).not.toBe('typical-included');
  });
  it('unknown stays unknown', () => { expect(checkedBag('Some New Air', 'unknown').status).toBe('unknown'); expect(checkedBag('', 'unknown').status).toBe('unknown'); });
});
