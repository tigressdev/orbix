// Display-only helpers mirroring the server's lodging rules (config/trip.json → lodging_usd). Totals always come from /api/evaluate.
import type { Meta, LodgingTier } from '@/types';

export function hotelSplit(meta: Meta, country: string, tier: LodgingTier): number {
  const sh = meta.lodging.shared;
  return sh && sh.countries.includes(country) && sh.tiers.includes(tier) ? sh.split || 2 : 1;
}
export function hotelFullRate(meta: Meta, city: string, tier: LodgingTier, override?: number): number {
  if (override != null) return override;
  if (meta.lodging.hosted?.[city]) return 0;                    // standing rule: staying with a host, no lodging cost
  return meta.lodging.cities[city]?.[tier] ?? meta.hotel_night[city] ?? meta.hotel_night.default ?? 0;
}
/** USD per night that YOU pay: your own override as typed, else the room price divided by the people sharing it. */
export function hotelRate(meta: Meta, city: string, tier: LodgingTier, override?: number): number {
  if (override != null) return override;
  return hotelFullRate(meta, city, tier) / hotelSplit(meta, meta.cities[city]?.country ?? '', tier);
}
