import { beforeEach, describe, expect, it } from 'vitest';
import { EVENTS } from '@/features/sacred-atlas/data/events';
import { SITES, siteById } from '@/features/sacred-atlas/data/sites';
import { CAUTIONS, THEMES, TRADITIONS } from '@/features/sacred-atlas/data/traditions';
import { TEMPLATES } from '@/features/sacred-atlas/data/journeys';
import { chinaWindow, eventAccess, festivalSeasonPassed } from '@/features/sacred-atlas/engine/calendar';
import { returnCheck, siteFeasibility, worst } from '@/features/sacred-atlas/engine/feasibility';
import { diffSummaries, planAlternative, spliceLegs, type EngineCtx } from '@/features/sacred-atlas/engine/alternatives';
import { coverage, DEFAULT_SACRED_PREFS } from '@/features/sacred-atlas/engine/preferences';
import { activeScenario, useStudio } from '@/stores/studio';
import { pathKeys, scenarioFromLegs } from '@/lib/tree';
import type { EvalResult, FlightOption, Leg, Meta, OptionsResult, Summary } from '@/types';

const ev = (id: string) => EVENTS.find((e) => e.id === id)!;
const AP: Record<string, string> = { MAD: 'MADRID', PEK: 'BEIJING', PVG: 'SHANGHAI', TFU: 'CHENGDU', SVO: 'MOSCOW', LXA: 'LHASA' };
const CITIES = {
  MADRID: { name: 'Madrid', country: 'Spain' }, BEIJING: { name: 'Beijing', country: 'China' }, SHANGHAI: { name: 'Shanghai', country: 'China' },
  CHENGDU: { name: 'Chengdu', country: 'China' }, MOSCOW: { name: 'Moscow', country: 'Russia' },
} as unknown as Meta['cities'];
const META: EngineCtx['meta'] = { airports: AP, cities: CITIES, home_city: 'MADRID', latest_arrival_local: '2027-03-25 16:30', stay_rules_hours: { default: { min: 4, max: 96 }, SHANGHAI: { min: 120, max: 216 } }, required: ['BEIJING', 'MOSCOW'] };

const leg = (o: string, d: string, dep: string, arr: string, price: number): Leg => ({
  key: `${o}>${d}@${dep}`, origin: o, destination: d, dep_local: dep, arr_local: arr, price, stops: 0, airlines: 'X', observed_at: '2026-11-09T10:00', source: 'browser',
  native_price: price, native_currency: 'USD', fx_day: '', duration_min: 120, baggage: { carry_on: 'yes', checked: 'unknown' }, via: [],
});
const opt = (l: Leg, cumulative = l.price): FlightOption => ({ ...l, ok: true, why: [], gap_hours: 0, nights_before: 0, hotel_before: 0, transfer: 0, increment: l.price, cumulative, onward: 0, airport_change: false });
const group = (city: string, opts: FlightOption[]) => ({ city, name: city, country: '', tag: '', interest: 0, ok_count: opts.length, blocked_count: 0, min_price: 0, min_cumulative: 0, best_key: '', min_duration_min: 0, min_stops: 0, date_from: '', date_to: '', stay_days: [0, 0] as [number, number], any_ok: true, options: opts });

/** A fake server: totals are whole-path sums of leg prices (like /api/evaluate), nights counted per city. */
function fakeServer(all: Leg[], onward: Record<string, Leg[]>) {
  const byKey = Object.fromEntries(all.map((l) => [l.key, l]));
  const summary = (keys: string[]): Summary => {
    const legs = keys.map((k) => byKey[k]!);
    const flights = legs.reduce((a, l) => a + l.price, 0);
    const nights: Record<string, number> = {};
    legs.forEach((l, i) => { const n = legs[i + 1]; if (n) { const c = AP[l.destination]!; nights[c] = (nights[c] ?? 0) + Math.round((Date.parse(n.dep_local.replace(' ', 'T')) - Date.parse(l.arr_local.replace(' ', 'T'))) / 86_400_000); } });
    const visited = legs.map((l) => AP[l.destination]!);
    return { flights, hotel: 0, hotel_full: 0, hotel_shared_nights: 0, hotel_saved: 0, bags: 0, transfers: 0, risk: 0, total: flights, adjusted: flights, nights, visited, complete: false, missing_required: META.required.filter((c) => !visited.includes(c)), legs: legs.length, city: '', here: '', flags: [] };
  };
  const calls: string[][] = [];
  return {
    calls,
    fetchOptions: async (path: string[]): Promise<OptionsResult> => {
      calls.push(path);
      const here = path.length ? AP[byKey[path[path.length - 1]!]!.destination]! : 'MADRID';
      const opts = (onward[here] ?? []).map((l) => opt(l));
      const groups = [...new Set(opts.map((o) => AP[o.destination]!))].map((c) => group(c, opts.filter((o) => AP[o.destination] === c)));
      return { summary: summary(path), groups };
    },
    evaluate: async (paths: string[][]): Promise<EvalResult[]> => paths.map((p) => ({ summary: summary(p), metrics: { destinations: [], stops_total: 0, birthday: { status: '', city: null, note: '' } } })),
  };
}

const L = {
  madPek: leg('MAD', 'PEK', '2027-02-12 13:00', '2027-02-13 06:00', 600),
  pekPvg: leg('PEK', 'PVG', '2027-02-21 13:00', '2027-02-21 15:00', 120),
  pvgSvo: leg('PVG', 'SVO', '2027-03-09 08:00', '2027-03-09 14:00', 400),
  svoMad: leg('SVO', 'MAD', '2027-03-20 10:00', '2027-03-20 16:00', 250),
  pekTfu: leg('PEK', 'TFU', '2027-02-21 07:00', '2027-02-21 10:00', 150),
  tfuPvg: leg('TFU', 'PVG', '2027-02-24 09:00', '2027-02-24 11:30', 110),
  tfuPvgLate: leg('TFU', 'PVG', '2027-03-07 09:00', '2027-03-07 11:30', 110),
};
const BASE = [L.madPek, L.pekPvg, L.pvgSvo, L.svoMad];

describe('Scenario A — Spring Festival', () => {
  const w = (arrive: string) => ({ arrive, leave: '2027-03-09' });
  it('arriving 14 Feb: official holiday over, Lantern Festival still ahead', () => {
    expect(eventAccess(ev('spring-holiday-2027'), w('2027-02-14')).access).toBe('passed');
    expect(eventAccess(ev('lantern-2027'), w('2027-02-14')).access).toBe('within-stay');
    expect(eventAccess(ev('cny-2027'), w('2027-02-14')).access).toBe('passed');
  });
  it('arriving 13 Feb: only the final holiday day remains', () => {
    expect(eventAccess(ev('spring-holiday-2027'), w('2027-02-13')).access).toBe('final-days');
  });
  it('arriving after 20 Feb: the principal festival period has passed', () => {
    expect(festivalSeasonPassed(w('2027-02-21'))).toBe(true);
    expect(eventAccess(ev('lantern-2027'), w('2027-02-21')).access).toBe('passed');
    expect(festivalSeasonPassed(w('2027-02-20'))).toBe(false);
  });
  it('Tibetan observances are not presented as reachable on a branch that does not go there', () => {
    expect(eventAccess(ev('losar-2027'), w('2027-02-05')).access).toBe('elsewhere');
  });
  it('keeps distinct calendars distinct even on the same Gregorian date', () => {
    expect(ev('cny-2027').dateStart).not.toBe(ev('losar-2027').dateStart);
    expect(ev('lantern-2027').dateStart).toBe(ev('chotrul-2027').dateStart);
    expect(ev('lantern-2027').distinctFrom).toContain('chotrul-2027');
    expect(ev('lantern-2027').calendarSystem).not.toBe(ev('chotrul-2027').calendarSystem);
    expect(EVENTS.every((e) => e.verifiedEventStatus !== ('confirmed-local' as never))).toBe(true);
  });
  it('derives the China window from the branch', () => {
    expect(chinaWindow(BASE, META)).toEqual({ arrive: '2027-02-13', leave: '2027-03-09' });
  });
});

describe('Scenario B — Tibet permit', () => {
  it('Lhasa is permit dependent and never recommendable, even when a fare exists', async () => {
    const lhasa = siteById('lhasa')!;
    const fare = leg('TFU', 'LXA', '2027-02-25 08:00', '2027-02-25 10:30', 200);
    const srv = fakeServer([...BASE, L.pekTfu, fare], { CHENGDU: [fare] });
    const plan = await planAlternative(lhasa, { meta: META, legs: BASE, ...srv });
    expect(siteFeasibility(lhasa).status).toBe('permit_dependent');
    expect(plan.feasibility).toBe('permit_dependent');
    expect(plan.kind).toBe('research-only');
    expect(plan.recommend.ok).toBe(false);
    expect(plan.legs.map((l) => l.key)).not.toContain(fare.key);
    expect(lhasa.visitRequirements.some((r) => /permit/i.test(r.text))).toBe(true);
    expect(lhasa.altitudeM).toBeGreaterThan(3000);
  });
  it('Jerusalem stays research-only until travel advice is verified', async () => {
    const j = siteById('jerusalem')!;
    expect(siteFeasibility(j).bookable).toBe(false);
    const srv = fakeServer(BASE, {});
    expect((await planAlternative(j, { meta: META, legs: BASE, ...srv })).kind).toBe('research-only');
  });
});

describe('Scenario C — cultural branch', () => {
  const meta = { fx: { latest_day: 'd', latest: { BRL: 5, RUB: 80 }, days: {} }, default_budget: 3000 } as unknown as Meta;
  beforeEach(() => { localStorage.clear(); useStudio.setState({ ready: false, viewOnly: false }); });
  it('Mount Emei from a branch through Chengdu becomes a chapter, not a flight node', async () => {
    const viaCtu = [L.madPek, L.pekTfu, L.tfuPvg, L.pvgSvo, L.svoMad];
    const srv = fakeServer(viaCtu, {});
    const plan = await planAlternative(siteById('emei')!, { meta: META, legs: viaCtu, ...srv });
    expect(plan.kind).toBe('chapter');
    expect(plan.legs.map((l) => l.key)).toEqual(viaCtu.map((l) => l.key));
    expect(plan.delta?.total).toBe(0);
    expect(srv.calls).toHaveLength(0);                 // no flight search for a day trip
  });
  it('adding the alternative creates an independent scenario and leaves the active one untouched', () => {
    useStudio.getState().hydrate('helen', meta, null);
    const st = useStudio.getState;
    st().addLeg(activeScenario(st()).rootId, L.madPek);
    const before = JSON.stringify(activeScenario(st()));
    const activeId = st().activeId;
    const alt = scenarioFromLegs('Sacred · Mount Emei', [L.madPek, L.pekTfu]);
    expect(st().addScenario(alt, 'test')).toBe(true);
    expect(st().scenarios).toHaveLength(2);
    expect(st().activeId).toBe(activeId);
    expect(JSON.stringify(activeScenario(st()))).toBe(before);
    alt.nodes[alt.focusId]!.note = 'changed later';
    expect(JSON.stringify(activeScenario(st()))).toBe(before);
  });
  it('refuses to add alternatives while viewing someone else’s plans', () => {
    useStudio.getState().hydrate('helen', meta, null);
    useStudio.setState({ viewOnly: true });
    expect(useStudio.getState().addScenario(scenarioFromLegs('x', []), 'x')).toBe(false);
  });
});

describe('Scenario D — budget impact without double counting', () => {
  it('inserts Chengdu, replaces the shared segment, and the delta equals new legs minus the removed one', async () => {
    const srv = fakeServer([...BASE, L.pekTfu, L.tfuPvg], { BEIJING: [L.pekTfu, L.pekPvg], CHENGDU: [L.tfuPvg] });
    const plan = await planAlternative(siteById('emei')!, { meta: META, legs: BASE, ...srv });
    expect(plan.kind).toBe('insert');
    const keys = plan.legs.map((l) => l.key);
    expect(keys).toEqual([L.madPek.key, L.pekTfu.key, L.tfuPvg.key, L.pvgSvo.key, L.svoMad.key]);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).not.toContain(L.pekPvg.key);
    expect(plan.delta?.flights).toBe(L.pekTfu.price + L.tfuPvg.price - L.pekPvg.price);
    expect(plan.ret.ok).toBe(true);
  });
  it('diffSummaries is a pure difference of whole-path totals', () => {
    const s = (t: number) => ({ flights: t, hotel: 10, bags: 0, transfers: 5, total: t + 15 }) as unknown as Summary;
    expect(diffSummaries(s(100), s(160))).toEqual({ flights: 60, hotel: 0, bags: 0, transfers: 0, total: 60 });
  });
  it('spliceLegs never repeats a flight key', () => {
    const r = spliceLegs(BASE, 1, L.pekTfu, L.pvgSvo, () => 0, (a) => AP[a]!);
    expect(new Set(r.legs.map((l) => l.key)).size).toBe(r.legs.length);
  });
  it('missing onward data is reported, not invented', async () => {
    const srv = fakeServer([...BASE, L.pekTfu], { BEIJING: [L.pekTfu], CHENGDU: [] });
    const plan = await planAlternative(siteById('emei')!, { meta: META, legs: BASE, ...srv });
    expect(plan.segments.some((s) => s.status === 'unavailable' && /Transport data unavailable — requires verification/.test(s.note ?? ''))).toBe(true);
    expect(plan.feasibility).toBe('requires_verification');
  });
});

describe('Scenario E — return deadline', () => {
  it('an alternative that breaks the rest of the route cannot be recommended', async () => {
    // Chengdu → Shanghai only on 7 Mar leaves < 120 h in Shanghai before the 9 Mar Moscow flight: the suffix is dropped
    const srv = fakeServer([...BASE, L.pekTfu, L.tfuPvgLate], { BEIJING: [L.pekTfu], CHENGDU: [L.tfuPvgLate] });
    const plan = await planAlternative(siteById('emei')!, { meta: META, legs: BASE, ...srv });
    expect(plan.legs[plan.legs.length - 1]!.destination).toBe('PVG');
    expect(plan.ret.ok).toBe(false);
    expect(plan.recommend.ok).toBe(false);
    expect(plan.recommend.reasons.join(' ')).toMatch(/Madrid/);
  });
  it('a branch landing in Madrid after the safe limit is flagged', () => {
    const late = [L.madPek, leg('PEK', 'MAD', '2027-03-25 10:00', '2027-03-25 18:00', 500)];
    const r = returnCheck(late, META);
    expect(r.ok).toBe(false);
    expect(r.reasons[0]).toMatch(/after the latest safe arrival/);
    expect(returnCheck(BASE, META).ok).toBe(true);
  });
  it('every template ends in Madrid', () => {
    for (const t of TEMPLATES) { expect(t.stops[0]!.id).toBe('MADRID'); expect(t.stops[t.stops.length - 1]!.id).toBe('MADRID'); }
    const corridor = TEMPLATES.find((t) => t.id === 'abrahamic-buddhist')!;
    expect(worst(corridor.stops.filter((s) => s.kind === 'site').map((s) => siteFeasibility(siteById(s.id)!).status))).not.toBe('explorable');
  });
});

describe('Scenario F — historical comparison', () => {
  const primary = ['judaism', 'christianity', 'islam', 'buddhism', 'tibetan-buddhism', 'daoism'];
  it('covers every theme for every primary tradition, with sources and branches', () => {
    for (const id of primary) {
      const t = TRADITIONS.find((x) => x.id === id)!;
      expect(t, id).toBeTruthy();
      for (const th of THEMES) expect(t.themes[th.id].summary.length, `${id}/${th.id}`).toBeGreaterThan(40);
      expect(t.sources.length).toBeGreaterThan(0);
      expect(t.branches.length).toBeGreaterThan(2);
    }
  });
  it('avoids unsupported equivalences', () => {
    const b = TRADITIONS.find((x) => x.id === 'buddhism')!;
    const d = TRADITIONS.find((x) => x.id === 'daoism')!;
    expect(b.themes.goal.summary).not.toMatch(/salvation/i);
    expect(b.themes.sacred.summary).toMatch(/No creator God/);
    expect(d.themes.sacred.summary).toMatch(/not a personal creator/);
    const all = CAUTIONS.join(' ');
    expect(all).toMatch(/not the same as Christian salvation/);
    expect(all).toMatch(/not the Abrahamic God/);
    expect(all).toMatch(/do not share a single historical origin/);
    expect(all).toMatch(/Chinese Buddhism and Tibetan Buddhism are distinct/);
  });
});

describe('catalog integrity', () => {
  it('has plausible coordinates, sources and statuses', () => {
    for (const s of SITES) {
      expect(Math.abs(s.latitude)).toBeLessThan(90);
      expect(Math.abs(s.longitude)).toBeLessThan(180);
      expect(s.sources.length + s.why.reading.length, s.id).toBeGreaterThan(0);
      for (const p of s.places) expect(Math.hypot(p.lat - s.latitude, p.lon - s.longitude), `${s.id}/${p.name}`).toBeLessThan(1);
    }
    const emei = siteById('emei')!;
    expect(emei.latitude).toBeGreaterThan(29); expect(emei.latitude).toBeLessThan(30); expect(emei.longitude).toBeGreaterThan(103); expect(emei.longitude).toBeLessThan(104);
  });
  it('coverage is transparent and bounded', () => {
    for (const s of SITES) { const c = coverage(s, DEFAULT_SACRED_PREFS); expect(c.score).toBeGreaterThanOrEqual(0); expect(c.score).toBeLessThanOrEqual(100); }
  });
  it('a plan built with empty branch keys asks for China first', async () => {
    const srv = fakeServer([], {});
    const plan = await planAlternative(siteById('emei')!, { meta: META, legs: [], ...srv });
    expect(plan.kind).toBe('no-china-path');
    expect(pathKeys(scenarioFromLegs('x', []), scenarioFromLegs('x', []).rootId)).toEqual([]);
  });
});
