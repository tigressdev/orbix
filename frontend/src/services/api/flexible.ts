import { api } from './client';
import type { Params } from './queries';
import type { Leg } from '@/types';

export interface DateChoice { preferred: string; flex: number }
export interface CoverageDay {
  date: string; preferred: boolean; status: 'observed' | 'stale' | 'missing' | 'protected';
  min_price?: number; offers?: number; observed_at?: string; note?: string; url: string;
}
export interface CoverageResult { from_name: string; to_name: string; days: CoverageDay[]; research_only: string | null }
export interface CorridorOption {
  legs: Leg[]; flights: number; hotel: number; bags: number; transfers: number; total: number;
  nights_total: number; depart_local: string; arrive_local: string; slack_hours_to_return: number | null;
  fragile_return: boolean; flags: string[]; observed_at: string; pareto: boolean; duration_hours: number;
}
export interface Corridor {
  id: string; label: string; chain: string[]; status: 'research_only' | 'incomplete' | 'comparable';
  restricted: Record<string, string>; missing_legs: string[]; unpriced: string[]; best: CorridorOption | null;
  options: CorridorOption[]; option_count: number; delta_vs_best_safe: number | null;
  legs: { from_name: string; to_name: string; days: CoverageDay[]; observed: number; needs_quote: number }[];
}
export interface CorridorsResult { corridors: Corridor[]; jobs: number; baseline_total: number | null }
export const fetchCoverage = (from: string, to: string, value: DateChoice, params: Params) =>
  api.post<CoverageResult>('/api/flex/coverage', { from, to, ...value, params, hard_min: '2027-02-12', hard_max: '2027-03-25' });
export const fetchCorridors = (value: DateChoice, params: Params) =>
  api.post<CorridorsResult>('/api/flex/corridors', { ...value, params, hard_min: '2027-02-12', hard_max: '2027-03-25' });
