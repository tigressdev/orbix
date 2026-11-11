import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { evaluatePaths, fetchOptions } from '@/services/api/queries';
import { useChapters, useMetaOrThrow, useParams } from '@/hooks/useStudioData';
import { useStudio } from '@/stores/studio';
import { pathKeys, pathLegs, scenarioFromLegs } from '@/lib/tree';
import { planAlternative, toAlternativeRecord, type AltPlan } from './engine/alternatives';
import { DEFAULT_SACRED_PREFS, type SacredPrefs } from './engine/preferences';
import { siteById } from './data/sites';

export function useSacredPrefs(): [SacredPrefs, (p: SacredPrefs) => void] {
  const p = useStudio((s) => s.prefs.sacred);
  const setPref = useStudio((s) => s.setPref);
  return [{ ...DEFAULT_SACRED_PREFS, ...p }, useCallback((v: SacredPrefs) => setPref('sacred', v), [setPref])];
}

/** Evaluates a sacred site against the active branch. Runs only when asked (enabled), because it calls the route engine. */
export function useSacredPlan(siteId: string | null, enabled: boolean) {
  const meta = useMetaOrThrow();
  const params = useParams();
  const { sc } = useChapters();
  const keys = pathKeys(sc, sc.focusId);
  return useQuery<AltPlan>({
    queryKey: ['sacred-plan', siteId, params, keys],
    enabled: enabled && !!siteId,
    staleTime: 60_000,
    queryFn: async () => {
      const site = siteById(siteId!)!;
      return planAlternative(site, {
        meta, legs: pathLegs(sc, sc.focusId),
        fetchOptions: (path) => fetchOptions(path, params),
        evaluate: async (paths) => (await evaluatePaths(paths, params)).results,
      });
    },
  });
}

/** Creates the alternative as a NEW scenario. The active scenario is left exactly as it was. */
export function useAddAlternative() {
  const { sc } = useChapters();
  const meta = useMetaOrThrow();
  return useCallback((plan: AltPlan) => {
    const name = `Sacred · ${plan.site.name}`;
    const alt = scenarioFromLegs(name, plan.legs);
    alt.sacred = toAlternativeRecord(plan, sc.id, sc.focusId);
    // annotate the node arriving at the chapter city (or the last node) so the Journey view explains why this branch exists
    const hubCity = plan.hub?.city;
    const target = Object.values(alt.nodes).find((n) => n.leg && hubCity && meta.airports[n.leg.destination] === hubCity) ?? alt.nodes[alt.focusId]!;
    const stay = plan.site.suggestedDuration ? ` (${plan.site.suggestedDuration.minDays}–${plan.site.suggestedDuration.maxDays} days)` : '';
    target.note = `Sacred Atlas: ${plan.site.name}${stay}${hubCity ? ` from ${plan.hub!.name}` : ''}. Unresolved: ${plan.unresolved.length} item(s). Status: ${plan.feasibility.replace('_', ' ')}.`;
    const ok = useStudio.getState().addScenario(alt, `Added Sacred Atlas alternative “${name}” (from “${sc.name}”)`);
    return ok ? alt.id : null;
  }, [sc, meta]);
}
