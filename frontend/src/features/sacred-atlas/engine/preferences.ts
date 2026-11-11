import type { ExperiencePreference, SacredSite, TraditionId } from '../types';

export type SacredPrefs = ExperiencePreference & { traditions: TraditionId[] };
export const DEFAULT_SACRED_PREFS: SacredPrefs = {
  traditionInterest: 2, historicalInterest: 3, landscapeInterest: 2, festivalInterest: 2, practiceInterest: 1, budgetSensitivity: 2, timeSensitivity: 2,
  traditions: ['chinese-buddhism', 'daoism', 'tibetan-buddhism'],
};

/**
 * Cultural / experiential coverage, 0–100, from YOUR weights and the catalog's editorial descriptors.
 * It says how well a place matches what you asked for. It is not, and cannot be, a measure of religious significance.
 */
export function coverage(site: SacredSite, p: SacredPrefs): { score: number; parts: { label: string; weight: number; value: number }[] } {
  const tradMatch = site.traditions.some((t) => p.traditions.includes(t)) ? 3 : 0;
  const parts = [
    { label: 'Traditions you chose', weight: p.traditionInterest, value: tradMatch },
    { label: 'History', weight: p.historicalInterest, value: site.descriptors.history },
    { label: 'Landscape', weight: p.landscapeInterest, value: site.descriptors.landscape },
    { label: 'Festivals in window', weight: p.festivalInterest, value: site.descriptors.festival },
    { label: 'Living practice', weight: p.practiceInterest, value: site.descriptors.practice },
  ];
  const w = parts.reduce((a, x) => a + x.weight, 0);
  const score = w ? Math.round((parts.reduce((a, x) => a + x.weight * x.value, 0) / (3 * w)) * 100) : 0;
  return { score, parts };
}

/** Ranking key with the formula visible to the user: coverage minus weighted, normalised cost and time. */
export function rankKey(cov: number, extraUsd: number | null, extraDays: number, p: SacredPrefs, maxUsd = 1500, maxDays = 7) {
  const c = extraUsd == null ? 0.5 : Math.min(1, Math.max(0, extraUsd) / maxUsd);
  const t = Math.min(1, Math.max(0, extraDays) / maxDays);
  return cov / 100 - (p.budgetSensitivity / 3) * 0.5 * c - (p.timeSensitivity / 3) * 0.5 * t;
}
