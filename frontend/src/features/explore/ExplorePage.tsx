import { RouteDateSearch } from '@/components/shared/RouteDateSearch';
import { ExplorePanel } from './ExplorePanel';
import { useChapters, useMetaOrThrow } from '@/hooks/useStudioData';

export default function ExplorePage() {
  const meta = useMetaOrThrow();
  const { sc, nodes } = useChapters();
  const last = nodes[nodes.length - 1]!;
  const here = last.leg ? meta.airports[last.leg.destination]! : meta.home_city;
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div><p className="eyebrow">Explore · from {meta.cities[here]?.name ?? here}</p><h1 className="display text-4xl font-semibold leading-tight">Where next?</h1>
        <p className="text-sm text-ink-2">Observed onward flights from your current position. Costs are calculated for this exact branch.</p></div>
      <RouteDateSearch />
      <ExplorePanel key={sc.focusId} parentNodeId={sc.focusId} />
    </div>
  );
}
