import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from './client';
import type { Params } from './queries';
import { useParams } from '@/hooks/useStudioData';
import { activeScenario, useStudio } from '@/stores/studio';
import { pathKeys } from '@/lib/tree';

/** observed: a valid observed fare exists · stale: quoted before, too old to use · missing: never quoted · temporally_blocked: no date
 *  fits the rules · research_only: can be studied, never recommended · confirmed: a purchased segment. */
export type CandidateState = 'observed' | 'stale' | 'missing' | 'temporally_blocked' | 'research_only' | 'confirmed';
export type DayStatus = 'observed' | 'observed_blocked' | 'stale' | 'missing';

export interface CandidateDay {
  date: string; status: DayStatus; in_flex: boolean; preferred: boolean; url: string;
  min_price?: number; offers?: number; observed_at?: string; reasons?: string[];
}
export interface SearchJob {
  origin_city: string; dest_city: string; date: string; status: 'missing' | 'stale'; score: number; kind: 'required' | 'valuable';
  components: Record<string, number>; sources: string[]; requested: boolean; research_only: boolean; exploration: boolean; url: string;
}
export interface Candidate {
  city: string; name: string; country: string; tag: string; interest: number; why_listed: string; state: CandidateState; required: boolean;
  research_only: string | null; dates: CandidateDay[]; excluded: Record<string, string[]>; preferred: string | null; flex: number;
  observed_count: number; min_price: number | null; stay_days: [number, number]; jobs: SearchJob[];
}
export interface DiscoverResult {
  here: string; here_name: string; arrive_local: string; remaining_required: string[]; flex: number; candidates: Candidate[];
  note: string; requests_writable: boolean;
}

export const fetchDiscover = (path: string[], params: Params, flex: number, preferred?: string, city?: string) =>
  api.post<DiscoverResult>('/api/discover', { path, params, flex, preferred, city });

/** Candidates from the end of a branch (node), quoted or not. Same server rules as "Add next"; nothing here is bookable. */
export function useDiscover(nid: string | null, flex: number, enabled = true) {
  const scenarios = useStudio((s) => s.scenarios);
  const activeId = useStudio((s) => s.activeId);
  const params = useParams();
  const sc = activeScenario({ scenarios, activeId });
  const keys = nid ? pathKeys(sc, nid) : null;
  return useQuery<DiscoverResult>({
    queryKey: ['discover', params, keys, flex], enabled: enabled && keys !== null, staleTime: 60_000,
    queryFn: () => fetchDiscover(keys!, params, flex),
  });
}

// -- quote requests: what the traveller asked the collector to search ------------------------------------------------------------
export interface QuoteRequest { origin_city: string; dest_city: string; date: string; requested_at: string; label?: string }
const LS = 'orbix.quoteRequests.v1';

export function localRequests(): QuoteRequest[] {
  try { return JSON.parse(localStorage.getItem(LS) ?? '[]') as QuoteRequest[]; } catch { return []; }
}
function saveLocal(list: QuoteRequest[]) {
  try { localStorage.setItem(LS, JSON.stringify(list)); } catch { /* storage unavailable: the request still shows in this session */ }
}

/** Records search requests. Locally the server appends them to data/queue/requests.jsonl for the collector; the hosted app is
 *  read-only, so they are kept in this browser and can be copied for the collector. Never a price. */
export async function requestQuotes(jobs: Pick<SearchJob, 'origin_city' | 'dest_city' | 'date'>[], label: string):
  Promise<{ where: 'server' | 'browser'; saved: number }> {
  const now = new Date().toISOString();
  const merged = new Map(localRequests().map((r) => [`${r.origin_city}|${r.dest_city}|${r.date}`, r]));
  for (const j of jobs) merged.set(`${j.origin_city}|${j.dest_city}|${j.date}`, { origin_city: j.origin_city, dest_city: j.dest_city, date: j.date, requested_at: now, label });
  saveLocal([...merged.values()]);
  try {
    const r = await api.post<{ saved: number }>('/api/quote-requests', { jobs: jobs.map(({ origin_city, dest_city, date }) => ({ origin_city, dest_city, date })), context: { label } });
    return { where: 'server', saved: r.saved };
  } catch (e) {
    if (e instanceof ApiError && (e.status === 501 || e.status === 401 || e.status === 404)) return { where: 'browser', saved: jobs.length };
    throw e;
  }
}

/** JSON lines the collector reads (tools/fare_collector.py queue --requests <file>). */
export const collectorText = (list: QuoteRequest[]) => list.map((r) => JSON.stringify(r)).join('\n');
