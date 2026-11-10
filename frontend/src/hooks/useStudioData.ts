import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { activeScenario, useStudio } from '@/stores/studio';
import { evaluatePaths, fetchOptions, type Params } from '@/services/api/queries';
import { useMeta } from '@/services/api/queries';
import { money as fmtMoney } from '@/lib/format';
import { pathKeys, pathNodes } from '@/lib/tree';
import type { EvalResult, Meta, OptionsResult, Summary } from '@/types';

/** Money formatter bound to the display currency and the exchange rates of the loaded metadata (USD in, display currency out). */
export function useMoney() {
  const { data: meta } = useMeta(true);
  const currency = useStudio((s) => s.prefs.currency);
  return useCallback((usd: number | null | undefined, day?: string | null) => (meta ? fmtMoney(meta.fx, usd, currency, day) : '—'), [meta, currency]);
}

export function useMetaOrThrow(): Meta {
  const { data } = useMeta(true);
  if (!data) throw new Error('meta not loaded');
  return data;
}

export function useParams(): Params {
  const hotel = useStudio((s) => s.hotel);
  const protect = useStudio((s) => s.prefs.protectBirthday);
  const lodging = useStudio((s) => s.prefs.lodging);
  return useMemo(() => ({ hotel_night: hotel, protect_birthday: protect, lodging_tier: lodging }), [hotel, protect, lodging]);
}

/** Server-side evaluation of every node of the active scenario (plus pinned nodes of others). Costs are never summed on the client. */
export function useEvaluation() {
  const scenarios = useStudio((s) => s.scenarios);
  const activeId = useStudio((s) => s.activeId);
  const compare = useStudio((s) => s.compare);
  const params = useParams();
  const sc = activeScenario({ scenarios, activeId });
  const refs = useMemo(() => {
    const out: { ref: string; keys: string[] }[] = Object.keys(sc.nodes).map((nid) => ({ ref: `${sc.id}:${nid}`, keys: pathKeys(sc, nid) }));
    for (const p of compare) {
      if (p.sid === sc.id) continue;
      const o = scenarios.find((x) => x.id === p.sid);
      if (o?.nodes[p.nid]) out.push({ ref: `${o.id}:${p.nid}`, keys: pathKeys(o, p.nid) });
    }
    return out;
  }, [sc, compare, scenarios]);
  const q = useQuery({
    queryKey: ['evaluate', params, refs.map((r) => r.ref + '|' + r.keys.join(','))],
    queryFn: async () => {
      const res = await evaluatePaths(refs.map((r) => r.keys), params);
      return Object.fromEntries(refs.map((r, i) => [r.ref, res.results[i]!])) as Record<string, EvalResult>;
    },
    placeholderData: (prev) => prev, staleTime: 60_000,
  });
  return { ...q, results: q.data ?? {}, of: (sid: string, nid: string) => q.data?.[`${sid}:${nid}`] };
}

export function useFocusSummary(): { summary: Summary | null; loading: boolean; stale: boolean } {
  const { scenarios, activeId } = useStudio();
  const sc = activeScenario({ scenarios, activeId });
  const ev = useEvaluation();
  const r = ev.of(sc.id, sc.focusId);
  if (!r) return { summary: null, loading: true, stale: false };
  if ('stale' in r && r.stale) return { summary: null, loading: false, stale: true };
  return { summary: (r as { summary: Summary }).summary, loading: false, stale: false };
}

/** What can come next from a node: observed onward flights, grouped by destination, with rule explanations. */
export function useNextOptions(nid: string | null) {
  const scenarios = useStudio((s) => s.scenarios);
  const activeId = useStudio((s) => s.activeId);
  const params = useParams();
  const sc = activeScenario({ scenarios, activeId });
  const keys = nid ? pathKeys(sc, nid) : null;
  return useQuery<OptionsResult>({
    queryKey: ['options', params, keys], enabled: keys !== null, staleTime: 60_000,
    queryFn: () => fetchOptions(keys!, params),
  });
}

export function useBudget() {
  const meta = useMetaOrThrow();
  const prefs = useStudio((s) => s.prefs);
  const { summary } = useFocusSummary();
  const purchased = prefs.includePurchased ? meta.purchased_ticket.total_usd ?? 0 : 0;
  const spent = (summary?.total ?? 0) + purchased;
  return { summary, purchased, spent, budget: prefs.budget, remaining: prefs.budget - spent, over: spent > prefs.budget, ratio: prefs.budget ? Math.min(1, spent / prefs.budget) : 0 };
}

export function useChapters() {
  const scenarios = useStudio((s) => s.scenarios);
  const activeId = useStudio((s) => s.activeId);
  const sc = activeScenario({ scenarios, activeId });
  return { sc, nodes: pathNodes(sc, sc.focusId) };
}
