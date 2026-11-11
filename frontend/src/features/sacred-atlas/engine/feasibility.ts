import type { Leg, Meta } from '@/types';
import type { Feasibility, SacredSite } from '../types';

export const FEAS_ORDER: Feasibility[] = ['explorable', 'requires_verification', 'permit_dependent', 'safety_restricted', 'unavailable'];
export const FEAS_LABEL: Record<Feasibility, string> = {
  explorable: 'Explorable', requires_verification: 'Requires verification', permit_dependent: 'Permit dependent', safety_restricted: 'Safety restricted', unavailable: 'Unavailable',
};
export const FEAS_NOTE: Record<Feasibility, string> = {
  explorable: 'Can be researched and added as a planning possibility.',
  requires_verification: 'Important information is missing.',
  permit_dependent: 'Special authorization is required.',
  safety_restricted: 'Current travel advice requires serious reconsideration.',
  unavailable: 'Reliable evidence says a required condition cannot be met.',
};
export const worst = (xs: Feasibility[]): Feasibility => xs.reduce<Feasibility>((a, b) => (FEAS_ORDER.indexOf(b) > FEAS_ORDER.indexOf(a) ? b : a), 'explorable');

/** Site status plus whether a route through it may ever be presented as bookable. */
export function siteFeasibility(site: SacredSite): { status: Feasibility; bookable: boolean; reasons: string[] } {
  const reasons = [...site.statusReasons];
  let status = site.accessibilityStatus;
  if (site.advisory?.required && !site.advisory.lastVerified) {
    status = worst([status, 'requires_verification']);
    reasons.push('Government travel advice has not been retrieved and dated in ORBIX.');
  }
  const bookable = status === 'explorable';
  return { status, bookable, reasons };
}

export interface ReturnCheck { ok: boolean; reasons: string[]; arriveMadrid: string | null }
/** The purchased Madrid → São Paulo flight is fixed: a branch is complete only if it lands in Madrid before the server's latest arrival. */
export function returnCheck(legs: Leg[], meta: Pick<Meta, 'airports' | 'home_city' | 'latest_arrival_local'>): ReturnCheck {
  const last = legs[legs.length - 1];
  if (!last || meta.airports[last.destination] !== meta.home_city) return { ok: false, arriveMadrid: null, reasons: ['Does not return to Madrid yet: the confirmed 25 March flight home cannot be reached on this branch.'] };
  if (last.arr_local > meta.latest_arrival_local) return { ok: false, arriveMadrid: last.arr_local, reasons: [`Lands in Madrid ${last.arr_local}, after the latest safe arrival (${meta.latest_arrival_local}) before the confirmed return flight.`] };
  return { ok: true, arriveMadrid: last.arr_local, reasons: [] };
}

/** A route can be recommended as a feasible complete journey only when every condition holds. */
export function recommendable(x: { feasibility: Feasibility; ret: ReturnCheck; missingRequired: string[]; unavailableSegments: number }) {
  const reasons: string[] = [];
  if (x.feasibility !== 'explorable') reasons.push(`Feasibility: ${FEAS_LABEL[x.feasibility]}.`);
  if (!x.ret.ok) reasons.push(...x.ret.reasons);
  if (x.missingRequired.length) reasons.push(`Required cities missing: ${x.missingRequired.join(', ')}.`);
  if (x.unavailableSegments) reasons.push(`${x.unavailableSegments} segment(s) without observed transport data.`);
  return { ok: reasons.length === 0, reasons };
}
