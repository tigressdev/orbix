// Journey Alternatives Engine. Turns "I am curious about this place" into a concrete, honest branch proposal:
// observed flights only (server /api/options, which applies the itinerary rules), costs only from server path evaluation
// (/api/evaluate) and never summed here, and every unknown listed instead of guessed.
import type { EvalResult, FlightOption, Leg, Meta, OptionsResult, Summary } from '@/types';
import type { Feasibility, SacredJourneyAlternative, SacredSite, TransportHub } from '../types';
import { recommendable, returnCheck, siteFeasibility, type ReturnCheck } from './feasibility';
import { CATALOG_VERSION } from '../data/journeys';

export interface EngineCtx {
  meta: Pick<Meta, 'airports' | 'cities' | 'home_city' | 'latest_arrival_local' | 'stay_rules_hours' | 'required'>;
  legs: Leg[];                                             // the active branch, root → focus
  fetchOptions: (pathKeys: string[]) => Promise<OptionsResult>;
  evaluate: (paths: string[][]) => Promise<EvalResult[]>;
}

export type Segment = SacredJourneyAlternative['proposedSegments'][number];
export type PlanKind = 'chapter' | 'insert' | 'research-only' | 'no-china-path';

export interface CostDelta { flights: number; hotel: number; bags: number; transfers: number; total: number }
export interface AltPlan {
  kind: PlanKind;
  site: SacredSite;
  hub: TransportHub | null;
  segments: Segment[];
  legs: Leg[];                         // full proposed path for the new branch
  base: Summary | null;
  alt: Summary | null;
  delta: CostDelta | null;             // alt − base, both server-evaluated full paths (shared legs are counted once in each)
  nightsDelta: Record<string, number>; // per city, + added, − displaced
  extraDays: number;
  ret: ReturnCheck;
  feasibility: Feasibility;
  recommend: { ok: boolean; reasons: string[] };
  unresolved: string[];
  notes: string[];
}

const UNAVAILABLE = 'Transport data unavailable — requires verification';
const hours = (a: string, b: string) => (Date.parse(b.replace(' ', 'T') + 'Z') - Date.parse(a.replace(' ', 'T') + 'Z')) / 3_600_000;
const cityOf = (ctx: EngineCtx, ap: string) => ctx.meta.airports[ap] ?? ap;
const countryOf = (ctx: EngineCtx, city: string) => ctx.meta.cities[city]?.country ?? '';
const keys = (legs: Leg[]) => legs.map((l) => l.key);
const ok = (r: EvalResult | undefined): Summary | null => (r && !('stale' in r && r.stale) ? (r as { summary: Summary }).summary : null);

/** The ORBIX city this site attaches to, preferring a chapter/day-trip relation. */
export function hubFor(site: SacredSite, meta: EngineCtx['meta']): TransportHub | null {
  const priced = site.nearbyTransportHubs.filter((h) => h.city && meta.cities[h.city]);
  return priced.find((h) => h.relation !== 'gateway') ?? priced.find((h) => h.mode !== 'air') ?? null;
}

/** Difference of two server summaries. Both are whole-path totals, so a leg shared by both paths cannot be counted twice. */
export function diffSummaries(base: Summary, alt: Summary): CostDelta {
  const d = (k: keyof CostDelta) => (alt[k] as number) - (base[k] as number);
  return { flights: d('flights'), hotel: d('hotel'), bags: d('bags'), transfers: d('transfers'), total: d('total') };
}
export function nightsDiff(base: Summary, alt: Summary): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of new Set([...Object.keys(base.nights), ...Object.keys(alt.nights)])) {
    const v = (alt.nights[c] ?? 0) - (base.nights[c] ?? 0);
    if (v) out[c] = v;
  }
  return out;
}

/** Replace leg i by legIn + legOut and re-attach the rest only when the next departure still respects the stay rule. */
export function spliceLegs(legs: Leg[], i: number, legIn: Leg, legOut: Leg | null, minStayH: (city: string) => number, cityOfAp: (ap: string) => string): { legs: Leg[]; keptSuffix: boolean } {
  const prefix = legs.slice(0, i);
  if (!legOut) return { legs: [...prefix, legIn], keptSuffix: false };
  const suffix = legs.slice(i + 1);
  const next = suffix[0];
  const fits = !next || hours(legOut.arr_local, next.dep_local) >= minStayH(cityOfAp(legOut.destination));
  const out = fits ? [...prefix, legIn, legOut, ...suffix] : [...prefix, legIn, legOut];
  // a shared segment must appear once: guard against the same flight key twice
  const seen = new Set<string>();
  return { legs: out.filter((l) => (seen.has(l.key) ? false : (seen.add(l.key), true))), keptSuffix: fits };
}

const cheapestOk = (opts: FlightOption[], after?: string) =>
  opts.filter((o) => o.ok && (!after || o.dep_local >= after)).sort((a, b) => a.cumulative - b.cumulative)[0] ?? null;

export async function planAlternative(site: SacredSite, ctx: EngineCtx): Promise<AltPlan> {
  const { meta, legs } = ctx;
  const sf = siteFeasibility(site);
  const hub = hubFor(site, meta);
  const unresolved: string[] = [];
  const notes: string[] = [];
  const segments: Segment[] = [];
  const minDays = site.suggestedDuration?.minDays ?? 1;
  const minStayH = (city: string) => meta.stay_rules_hours[city]?.min ?? meta.stay_rules_hours.default?.min ?? 4;
  for (const h of site.nearbyTransportHubs) if (h.certainty !== 'fact') unresolved.push(`${h.name} → ${site.name}: ${h.note}`);
  for (const r of site.visitRequirements) if (r.certainty !== 'fact' || site.accessibilityStatus !== 'explorable') unresolved.push(r.text);
  unresolved.push('Entrance fees, local transport and any guided-tour costs are not priced in ORBIX.');

  let kind: PlanKind;
  let newLegs = legs;
  const visited = legs.map((l) => cityOf(ctx, l.destination));
  // insertion point: the first leg that departs from China; if the branch currently ends in China, append after it
  const departsChina = legs.findIndex((l) => countryOf(ctx, cityOf(ctx, l.origin)) === 'China');
  const last = legs[legs.length - 1];
  const endsInChina = !!last && countryOf(ctx, cityOf(ctx, last.destination)) === 'China';
  const chinaIdx = departsChina >= 0 ? departsChina : endsInChina ? legs.length : -1;

  if (!sf.bookable && site.accessibilityStatus !== 'explorable' && site.accessibilityStatus !== 'requires_verification') {
    kind = 'research-only';
    notes.push('Saved as a research branch only: ORBIX will not build bookable flights until the conditions are met.');
  } else if (site.advisory?.required && !site.advisory.lastVerified) {
    kind = 'research-only';
    notes.push('Travel advice not verified: no itinerary is generated.');
  } else if (!hub) {
    kind = 'research-only';
    notes.push(`${site.name} is outside ORBIX price data.`);
    segments.push({ from: '—', to: site.name, status: 'unavailable', note: UNAVAILABLE });
  } else if (visited.includes(hub.city!)) {
    kind = 'chapter';
    segments.push({ from: meta.cities[hub.city!]?.name ?? hub.city!, to: site.name, status: 'ground-unverified', note: hub.note });
  } else if (chinaIdx < 0) {
    kind = 'no-china-path';
    notes.push('Your branch does not reach China yet. Add the flight into Beijing first, then evaluate again.');
  } else {
    kind = 'insert';
    const i = chinaIdx;
    const prefix = legs.slice(0, i);
    const after = legs[i];
    const hubCity = hub.city!;
    const fromAp = after ? after.origin : last!.destination;
    const fromName = meta.cities[cityOf(ctx, fromAp)]?.name ?? fromAp;
    const hubName = meta.cities[hubCity]?.name ?? hubCity;
    const o1 = await ctx.fetchOptions(keys(prefix));
    const legIn = cheapestOk(o1.groups.find((g) => g.city === hubCity)?.options ?? []);
    if (!legIn) {
      segments.push({ from: fromName, to: hubName, status: 'unavailable', note: UNAVAILABLE });
      newLegs = prefix;
    } else if (!after) {
      segments.push({ from: fromName, to: hubName, status: 'observed', legKey: legIn.key });
      segments.push({ from: hubName, to: site.name, status: 'ground-unverified', note: hub.note });
      newLegs = [...prefix, legIn];
      notes.push(`Continue from ${hubName} in Journey: onward flights are chosen there.`);
    } else {
      segments.push({ from: fromName, to: hubName, status: 'observed', legKey: legIn.key });
      segments.push({ from: hubName, to: site.name, status: 'ground-unverified', note: hub.note });
      const dest = cityOf(ctx, after.destination);
      const destName = meta.cities[dest]?.name ?? dest;
      const o2 = await ctx.fetchOptions([...keys(prefix), legIn.key]);
      const earliest = new Date(Date.parse(legIn.arr_local.replace(' ', 'T') + 'Z') + minDays * 86_400_000).toISOString().slice(0, 16).replace('T', ' ');
      const legOut = cheapestOk(o2.groups.find((g) => g.city === dest)?.options ?? [], earliest);
      if (!legOut) segments.push({ from: hubName, to: destName, status: 'unavailable', note: UNAVAILABLE });
      else segments.push({ from: hubName, to: destName, status: 'observed', legKey: legOut.key });
      const sp = spliceLegs(legs, i, legIn, legOut, minStayH, (ap) => cityOf(ctx, ap));
      newLegs = sp.legs;
      if (legOut && sp.keptSuffix) segments.push({ from: destName, to: 'rest of your route', status: 'kept' });
      else if (legOut) notes.push(`The rest of your route no longer fits after ${destName}: pick new onward flights in Journey.`);
    }
  }

  // Cost & time: two whole-path server evaluations.
  let base: Summary | null = null, alt: Summary | null = null;
  if (legs.length) {
    const res = await ctx.evaluate([keys(legs), keys(newLegs)]);
    base = ok(res[0]); alt = ok(res[1]);
  }
  const delta = base && alt ? diffSummaries(base, alt) : null;
  const nightsDelta = base && alt ? nightsDiff(base, alt) : {};
  let extraDays = Object.values(nightsDelta).filter((v) => v > 0).reduce((a, b) => a + b, 0);
  if (kind === 'chapter' && hub?.city && base) {
    const have = base.nights[hub.city] ?? 0;
    if (have < minDays) notes.push(`Needs about ${minDays} nights in ${meta.cities[hub.city]?.name}; this branch has ${have}. Choose a later onward flight in Journey.`);
    else notes.push(`Fits inside your ${have}-night stay in ${meta.cities[hub.city]?.name}: no new flight, no extra nights.`);
    extraDays = Math.max(0, minDays - have);
  }
  const ret = returnCheck(newLegs, meta);
  const missingRequired = alt?.missing_required ?? meta.required.filter((c) => !newLegs.some((l) => cityOf(ctx, l.destination) === c));
  const unavailableSegments = segments.filter((s) => s.status === 'unavailable').length;
  const feasibility = unavailableSegments ? (sf.status === 'explorable' ? 'requires_verification' : sf.status) : sf.status;
  const recommend = recommendable({ feasibility, ret, missingRequired, unavailableSegments });
  return { kind, site, hub, segments, legs: newLegs, base, alt, delta, nightsDelta, extraDays, ret, feasibility, recommend, unresolved: [...new Set(unresolved)], notes };
}

export function toAlternativeRecord(plan: AltPlan, baseScenarioId: string, baseNodeId: string): SacredJourneyAlternative {
  return {
    id: `alt-${plan.site.id}-${Date.now().toString(36)}`, baseScenarioId, baseNodeId, sacredSiteIds: [plan.site.id], proposedSegments: plan.segments,
    estimatedCost: { deltaUsd: plan.delta?.total ?? null, basis: 'Server evaluation of both whole paths (observed fares + configured estimates). Ground transport, fees and permits not included.' },
    estimatedDuration: { extraDays: plan.extraDays, basis: 'Nights per city from the server evaluation; site duration is editorial.' },
    feasibility: plan.feasibility, unresolvedRequirements: plan.unresolved,
    sourceProvenance: ['ORBIX observed fares (provider + observed_at on each leg)', `Sacred Atlas catalog ${CATALOG_VERSION}`],
    catalogVersion: CATALOG_VERSION, createdAt: Date.now(),
  };
}
