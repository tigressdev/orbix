import { beforeEach, describe, expect, it } from 'vitest';
import { activeScenario, useStudio } from '@/stores/studio';
import { pathKeys } from '@/lib/tree';
import type { Leg, Meta, PersistedState } from '@/types';

const meta = { fx: { latest_day: 'd', latest: { BRL: 5, RUB: 80 }, days: {} }, default_budget: 3000 } as unknown as Meta;
const leg: Leg = { key: 'MAD>PEK@x', origin: 'MAD', destination: 'PEK', dep_local: '2027-02-12 10:00', arr_local: '2027-02-13 06:00', price: 700, stops: 1, airlines: 'X', observed_at: '', source: 'browser', native_price: 700, native_currency: 'USD', fx_day: '', duration_min: 900, baggage: { carry_on: 'yes', checked: 'unknown' }, via: [] };

beforeEach(() => { localStorage.clear(); useStudio.setState({ ready: false, viewOnly: false }); });

describe('canonical itinerary store', () => {
  it('starts with one empty scenario and the default budget in USD', () => {
    useStudio.getState().hydrate('helen', meta, null);
    const s = useStudio.getState();
    expect(s.scenarios).toHaveLength(1);
    expect(s.prefs.budget).toBe(3000);
    expect(s.prefs.includePurchased).toBe(false);          // the purchased ticket is never silently included
  });
  it('converts a budget saved before the dollar became central (BRL to USD)', () => {
    const saved = { v: 1, prefs: { budget: 15000 }, scenarios: [{ id: 's', name: 'x', saved: false, createdAt: 0, rootId: 'r', focusId: 'r', nodes: { r: { id: 'r', parent: null, children: [], leg: null, collapsed: false, note: '' } } }], activeId: 's', compare: [], history: [], hotel: {} } as unknown as PersistedState;
    useStudio.getState().hydrate('helen', meta, saved);
    expect(useStudio.getState().prefs.budget).toBe(3000);
    expect(useStudio.getState().prefs.budgetCurrency).toBe('USD');
  });
  it('adds a leg, removes it and restores it with undo', () => {
    useStudio.getState().hydrate('helen', meta, null);
    const st = useStudio.getState;
    st().addLeg(activeScenario(st()).rootId, leg);
    expect(pathKeys(activeScenario(st()), activeScenario(st()).focusId)).toEqual(['MAD>PEK@x']);
    st().removeNode(activeScenario(st()).focusId);
    expect(Object.keys(activeScenario(st()).nodes)).toHaveLength(1);
    st().undoRemove();
    expect(Object.keys(activeScenario(st()).nodes)).toHaveLength(2);
  });
  it('refuses every change while looking at another person’s plans', () => {
    useStudio.getState().hydrate('helen', meta, null);
    useStudio.setState({ viewOnly: true });
    const st = useStudio.getState;
    st().addLeg(activeScenario(st()).rootId, leg);
    st().newScenario('nope');
    expect(Object.keys(activeScenario(st()).nodes)).toHaveLength(1);
    expect(st().scenarios).toHaveLength(1);
  });
  it('keeps two scenarios independent', () => {
    useStudio.getState().hydrate('helen', meta, null);
    const st = useStudio.getState;
    st().addLeg(activeScenario(st()).rootId, leg);
    st().newScenario('B');
    expect(Object.keys(activeScenario(st()).nodes)).toHaveLength(1);
    expect(Object.keys(st().scenarios[0]!.nodes)).toHaveLength(2);
  });
});
