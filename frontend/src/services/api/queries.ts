import { useQuery } from '@tanstack/react-query';
import { api } from './client';
import type { EvalResult, Leg, Meta, OptionsResult, Session, StateResponse, Trends } from '@/types';

export const useSession = () => useQuery({ queryKey: ['session'], queryFn: () => api.get<Session>('/api/session'), retry: false, staleTime: 60_000 });
export const useMeta = (enabled: boolean) => useQuery({ queryKey: ['meta'], queryFn: () => api.get<Meta>('/api/meta'), enabled, staleTime: 5 * 60_000 });
export const useTrends = () => useQuery({ queryKey: ['trends'], queryFn: () => api.get<Trends>('/api/trends'), staleTime: 5 * 60_000 });
export const fetchState = (user?: string) => api.get<StateResponse>(user ? `/api/state?user=${encodeURIComponent(user)}` : '/api/state');

export interface Highlight {
  key: string; title: string; subtitle: string; reasons?: string[];
  trip: { signature: string; cities: string[]; legs: Leg[]; summary: { total: number; flights: number; hotel: number; complete: boolean }; metrics: { flight_hours?: number; nights_china?: number; nights_russia?: number } };
}
export interface Insights { status: string; error?: string; complete_count?: number; highlights?: Highlight[]; gaps?: { city: string; name: string }[] }
export const useInsights = () => useQuery({
  queryKey: ['analysis'], queryFn: () => api.get<Insights>('/api/analysis'),
  refetchInterval: (q) => (q.state.data?.status === 'computing' ? 1500 : false), staleTime: 5 * 60_000,
});

export interface Params { hotel_night: Record<string, number>; protect_birthday: boolean; lodging_tier: string }
export const evaluatePaths = (paths: string[][], params: Params) => api.post<{ results: EvalResult[] }>('/api/evaluate', { paths, params });
export const fetchOptions = (path: string[], params: Params) => api.post<OptionsResult>('/api/options', { path, params, show_all: true });
