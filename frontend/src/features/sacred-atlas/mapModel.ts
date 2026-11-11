import { SITES } from './data/sites';
import { EVENTS } from './data/events';
import type { SacredSite } from './types';

export type LayerKey = 'journey' | 'sites' | 'traditions' | 'festivals' | 'routes';

/** Broad descriptive grouping for marker colour only; it does not imply a shared origin. */
export function familyOf(s: SacredSite): 'abrahamic' | 'chinese' | 'tibetan' | 'himalayan' {
  // Xi'an lists Christianity and Islam as historical presences, but its primary landscape is Chinese Buddhist: colour by the lead tradition
  if (['judaism', 'christianity', 'islam'].includes(s.traditions[0]!)) return 'abrahamic';
  if (s.traditions.includes('hinduism')) return 'himalayan';
  if (s.traditions.length === 1 && s.traditions[0] === 'tibetan-buddhism') return 'tibetan';
  return 'chinese';
}
export const FAMILY_LABEL = { abrahamic: 'Judaism · Christianity · Islam', chinese: 'Chinese Buddhism · Daoism', tibetan: 'Tibetan Buddhism', himalayan: 'Himalayan plural traditions' };
export const FAMILY_VAR = { abrahamic: '--blue', chinese: '--teal', tibetan: '--lilac', himalayan: '--gold' };

export const festivalSiteIds = () => new Set(SITES.filter((s) => EVENTS.some((e) => e.locations.includes(s.id) || s.nearbyTransportHubs.some((h) => h.relation !== 'gateway' && h.city && e.locations.includes(h.city)))).map((s) => s.id));

