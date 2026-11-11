import type { Leg, Meta } from '@/types';
import type { CulturalEvent } from '../types';

export interface Window { arrive: string | null; leave: string | null }

/** First arrival in mainland China and last departure from it on a path (dates only, local). */
export function chinaWindow(legs: Leg[], meta: Pick<Meta, 'airports' | 'cities'>): Window {
  const inChina = (ap: string) => meta.cities[meta.airports[ap] ?? '']?.country === 'China';
  const first = legs.find((l) => inChina(l.destination) && !inChina(l.origin));
  const lastOut = [...legs].reverse().find((l) => inChina(l.origin) && !inChina(l.destination));
  return { arrive: first ? first.arr_local.slice(0, 10) : null, leave: lastOut ? lastOut.dep_local.slice(0, 10) : null };
}

export type Access =
  | 'no-china-dates'   // the branch has no China arrival yet
  | 'passed'           // ended before arrival
  | 'final-days'       // already under way at arrival: only its last day(s) remain
  | 'within-stay'      // falls between arrival and departure
  | 'after-stay'       // the traveller has left by then
  | 'elsewhere';       // the observance belongs to a place outside the branch (e.g. Tibet)

export interface EventAccess { access: Access; label: string; note: string }

const LABEL: Record<Access, string> = {
  'no-china-dates': 'Add a China arrival to check', passed: 'Already passed', 'final-days': 'Final days only', 'within-stay': 'During your stay',
  'after-stay': 'After you leave China', elsewhere: 'Elsewhere on that date',
};

/**
 * Whether an observance overlaps the time in China. Overlap NEVER means access: local programmes, tickets and availability are verified separately.
 * `placesInPath` are ORBIX city ids on the branch; events tied only to non-path places (Lhasa, Kathmandu) come back as "elsewhere".
 */
export function eventAccess(ev: CulturalEvent, w: Window, placesInPath: string[] = []): EventAccess {
  const pick = (access: Access, note: string): EventAccess => ({ access, label: LABEL[access], note });
  const cityLinked = ev.locations.some((l) => /^[A-Z_]+$/.test(l));
  if (!cityLinked && !ev.locations.some((l) => placesInPath.includes(l)))
    return pick('elsewhere', 'Observed mainly in Tibetan and Himalayan communities; this branch does not go there.');
  if (!w.arrive) return pick('no-china-dates', 'Choose a flight into China to compare dates.');
  if (ev.dateEnd < w.arrive) return pick('passed', `Ends ${fmt(ev.dateEnd)}; you arrive ${fmt(w.arrive)}.`);
  if (ev.dateStart < w.arrive) return pick('final-days', `Under way since ${fmt(ev.dateStart)}; ${fmt(w.arrive)}–${fmt(ev.dateEnd)} remain.`);
  if (w.leave && ev.dateStart > w.leave) return pick('after-stay', `You leave China ${fmt(w.leave)}.`);
  return pick('within-stay', 'Date overlaps your stay. Local events and tickets still need verification.');
}

/** True once the principal Lunar New Year season (to the Lantern Festival) is over at arrival. */
export const festivalSeasonPassed = (w: Window, lantern = '2027-02-20') => !!w.arrive && w.arrive > lantern;

export const fmt = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
