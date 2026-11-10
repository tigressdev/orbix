import { describe, expect, it } from 'vitest';
import { addChild, branchToScenario, duplicateScenario, leaves, makeScenario, pathKeys, removeNode } from '@/lib/tree';
import type { Leg } from '@/types';

const leg = (o: string, d: string, key = `${o}>${d}@x`): Leg => ({ key, origin: o, destination: d, dep_local: '2027-02-12 10:00', arr_local: '2027-02-13 06:00', price: 100, stops: 0, airlines: 'X', observed_at: '2026-11-10T12:00:00+00:00', source: 'browser', native_price: 100, native_currency: 'USD', fx_day: '2026-11-10', duration_min: 600, baggage: { carry_on: 'yes', checked: 'unknown' }, via: [] });

function plan() {
  let sc = makeScenario('A');
  sc = addChild(sc, sc.rootId, leg('MAD', 'PEK'));
  const bj = sc.focusId;
  sc = addChild(sc, bj, leg('PEK', 'PVG'));
  const sh = sc.focusId;
  sc = addChild(sc, bj, leg('PEK', 'SVO'));              // a second branch from Beijing
  return { sc, bj, sh, mow: sc.focusId };
}

describe('scenario tree', () => {
  it('builds the path of a branch from the root', () => {
    const { sc, sh, mow } = plan();
    expect(pathKeys(sc, sh)).toEqual(['MAD>PEK@x', 'PEK>PVG@x']);
    expect(pathKeys(sc, mow)).toEqual(['MAD>PEK@x', 'PEK>SVO@x']);
  });
  it('does not add the same flight twice; it focuses the existing one', () => {
    const { sc, bj, sh } = plan();
    const again = addChild(sc, bj, leg('PEK', 'PVG'));
    expect(Object.keys(again.nodes)).toHaveLength(Object.keys(sc.nodes).length);
    expect(again.focusId).toBe(sh);
  });
  it('removing a node removes everything after it and keeps the siblings', () => {
    const { sc, bj, sh, mow } = plan();
    const cut = removeNode(sc, sh);
    expect(cut.nodes[sh]).toBeUndefined();
    expect(cut.nodes[mow]).toBeDefined();
    expect(cut.nodes[bj]!.children).toEqual([mow]);
    expect(removeNode(sc, sc.rootId)).toBe(sc);           // the root can never be removed
  });
  it('duplicates a scenario with independent nodes', () => {
    const { sc } = plan();
    const copy = duplicateScenario(sc);
    expect(copy.id).not.toBe(sc.id);
    expect(Object.keys(copy.nodes)).toHaveLength(Object.keys(sc.nodes).length);
    expect(Object.keys(copy.nodes).some((id) => id in sc.nodes)).toBe(false);
    const edited = addChild(copy, copy.focusId, leg('SVO', 'IST'));
    expect(Object.keys(sc.nodes)).toHaveLength(Object.keys(copy.nodes).length);   // the original is untouched
    expect(leaves(edited).length).toBeGreaterThan(0);
  });
  it('promotes a branch to its own linear scenario', () => {
    const { sc, mow } = plan();
    const b = branchToScenario(sc, mow, 'B');
    expect(pathKeys(b, b.focusId)).toEqual(['MAD>PEK@x', 'PEK>SVO@x']);
    expect(Object.keys(b.nodes)).toHaveLength(3);
  });
});
