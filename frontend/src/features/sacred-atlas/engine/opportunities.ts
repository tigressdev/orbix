import type { Leg, Meta } from '@/types';
import { SITES } from '../data/sites';
import { EVENTS } from '../data/events';
import { CITY_EXPERIENCES, STORIES, type ExpKind } from '../data/experiences';
import { siteFeasibility } from './feasibility';
import { coverage, type SacredPrefs } from './preferences';
import type { Feasibility, TraditionId } from '../types';

export type OppClass =
  | 'during-stay'            // fits inside the dates you already have there
  | 'day-trip'               // reachable and back the same day from that city
  | 'extra-overnight'        // needs nights you do not have yet
  | 'requires-date-change'   // an event close to, but outside, your dates
  | 'outside-window'         // an event far from your dates
  | 'access-restricted'      // permit or safety conditions apply
  | 'requires-verification';

export interface Opportunity {
  id: string;
  title: string;
  kind: ExpKind | 'site' | 'event';
  cls: OppClass;
  siteId?: string;
  eventId?: string;
  traditions: (TraditionId | string)[];
  text: string;
  when: string;                 // event date or practical visit window
  duration?: string;
  connection?: string;          // verified wording from the catalog, or undefined
  feasibility: Feasibility;
  confidence: 'calendar-date' | 'tentative-date' | 'editorial' ;
  score: number;                // coverage of the traveller's stated interests, 0-100 (sites only)
  note: string;
}

export const OPP_LABEL: Record<OppClass, string> = {
  'during-stay': 'During your stay', 'day-trip': 'Day trip', 'extra-overnight': 'Needs extra nights', 'requires-date-change': 'Needs a date change',
  'outside-window': 'Outside your dates', 'access-restricted': 'Access restricted', 'requires-verification': 'Requires verification',
};

const days = (a: string, b: string) => Math.round((Date.parse(b.slice(0, 10) + 'T00:00:00Z') - Date.parse(a.slice(0, 10) + 'T00:00:00Z')) / 86_400_000);

export interface Stay { city: string; arrive: string; depart: string | null; nights: number | null }

/** City stays of a branch: where the traveller is, and from when to when (ISO dates). The last stay is open-ended. */
export function staysOf(legs: Leg[], meta: Pick<Meta, 'airports'>): Stay[] {
  return legs.map((l, i) => {
    const next = legs[i + 1];
    const arrive = l.arr_local.slice(0, 10), depart = next ? next.dep_local.slice(0, 10) : null;
    return { city: meta.airports[l.destination] ?? l.destination, arrive, depart, nights: depart ? days(arrive, depart) : null };
  });
}

/**
 * What could be experienced from `location` between two dates. Destination recommendations, never confirmed bookings:
 * a sacred site attached to a city is a chapter or day trip of that stay, not a flight of its own.
 */
export function getCulturalOpportunities(location: string, arrivalDate: string, departureDate: string | null, preferences: SacredPrefs): Opportunity[] {
  const out: Opportunity[] = [];
  const nights = departureDate ? days(arrivalDate, departureDate) : null;
  const end = departureDate ?? arrivalDate;

  for (const s of SITES) {
    const hub = s.nearbyTransportHubs.find((h) => h.city === location);
    if (!hub) continue;
    const f = siteFeasibility(s);
    const need = s.suggestedDuration?.minDays ?? 1;
    let cls: OppClass;
    let note: string;
    if (f.status === 'permit_dependent' || f.status === 'safety_restricted' || f.status === 'unavailable') { cls = 'access-restricted'; note = s.statusReasons[0] ?? ''; }
    else if (hub.relation === 'gateway' && hub.mode === 'air') { cls = 'requires-verification'; note = hub.note; }
    else if (hub.relation === 'day-trip') { cls = 'day-trip'; note = nights === 0 ? 'You have no full day here yet.' : 'Fits in one day of your stay.'; }
    else if (nights == null) { cls = 'during-stay'; note = `Plan about ${need} day(s); your departure from here is not chosen yet.`; }
    else if (nights >= need + 1) { cls = 'during-stay'; note = `Your ${nights} nights leave room for the ${need}–${s.suggestedDuration?.maxDays ?? need} days this needs.`; }
    else { cls = 'extra-overnight'; note = `Needs about ${need} day(s); you have ${nights} night(s) here.`; }
    if (cls !== 'access-restricted' && f.status === 'requires_verification' && s.id !== location.toLowerCase()) note += ' Conditions unverified.';
    out.push({
      id: `site-${s.id}`, title: s.name, kind: 'site', cls, siteId: s.id, traditions: s.traditions, text: STORIES[s.id]?.experiences[0]?.text ?? s.significance,
      when: 'Any day of your stay; check opening hours', duration: s.suggestedDuration ? `${s.suggestedDuration.minDays}–${s.suggestedDuration.maxDays} days` : undefined,
      connection: hub.note, feasibility: f.status, confidence: 'editorial', score: coverage(s, preferences).score, note,
    });
  }

  for (const [i, x] of (CITY_EXPERIENCES[location] ?? []).entries()) {
    out.push({
      id: `city-${location}-${i}`, title: x.title, kind: x.kind, cls: 'during-stay', traditions: [], text: x.text, when: x.kind === 'festival' ? 'Around the New Year season; dates and venues change' : 'Any day of your stay',
      duration: x.hours, feasibility: 'requires_verification', confidence: 'editorial', score: 0, note: 'Possible cultural experience — local schedule not confirmed.',
    });
  }

  for (const e of EVENTS) {
    if (!e.locations.includes(location)) continue;
    let cls: OppClass;
    let note: string;
    if (e.dateEnd >= arrivalDate && e.dateStart <= end) { cls = 'during-stay'; note = 'The date falls within your stay. Local programmes and tickets are not confirmed.'; }
    else {
      const gap = e.dateEnd < arrivalDate ? days(e.dateEnd, arrivalDate) : days(end, e.dateStart);
      cls = gap <= 3 ? 'requires-date-change' : 'outside-window';
      note = e.dateEnd < arrivalDate ? `Ends ${gap} day(s) before you arrive.` : `Starts ${gap} day(s) after you leave.`;
    }
    out.push({
      id: `event-${e.id}`, title: e.name, kind: 'event', cls, eventId: e.id, traditions: e.traditions, text: e.significance,
      when: e.dateStart === e.dateEnd ? e.dateStart : `${e.dateStart} → ${e.dateEnd}`, feasibility: 'requires_verification',
      confidence: e.verifiedEventStatus === 'calendar-date' ? 'calendar-date' : 'tentative-date', score: 0, note,
    });
  }

  const order: OppClass[] = ['during-stay', 'day-trip', 'extra-overnight', 'requires-date-change', 'requires-verification', 'access-restricted', 'outside-window'];
  return out.sort((a, b) => order.indexOf(a.cls) - order.indexOf(b.cls) || b.score - a.score);
}

/** Collision-free rows for date bars: each item goes to the first lane whose last bar ends before it starts (plus room for its label). */
export function packLanes<T extends { start: number; end: number }>(items: T[], gap = 0): (T & { lane: number })[] {
  const ends: number[] = [];
  return [...items].sort((a, b) => a.start - b.start || a.end - b.end).map((it) => {
    let lane = ends.findIndex((e) => e + gap < it.start);
    if (lane < 0) { lane = ends.length; ends.push(it.end); } else ends[lane] = it.end;
    return { ...it, lane };
  });
}
