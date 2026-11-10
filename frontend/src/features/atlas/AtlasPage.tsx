import { lazy, Suspense, useState } from 'react';
import { Compass, X } from 'lucide-react';
import { Button, Card, Chip, Skeleton } from '@/components/ui/primitives';
import { Sheet } from '@/components/ui/Sheet';
import { ExplorePanel } from '@/features/explore/ExplorePanel';
import { useChapters, useMetaOrThrow, useMoney, useNextOptions } from '@/hooks/useStudioData';
import { range, dur, stops } from '@/lib/format';

const AtlasMap = lazy(() => import('./AtlasMap'));

export default function AtlasPage() {
  const meta = useMetaOrThrow();
  const m = useMoney();
  const { sc } = useChapters();
  const next = useNextOptions(sc.focusId);
  const [city, setCity] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const g = city ? next.data?.groups.find((x) => x.city === city) : undefined;
  const cm = city ? meta.cities[city] : undefined;
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-3">
      <div><p className="eyebrow">Atlas</p><h1 className="display text-4xl font-semibold leading-tight">Explore geographically</h1>
        <p className="text-sm text-ink-2">Solid teal is your selected route. Dashed lines are observed alternatives from where you are; violet ones lead to a required destination.</p></div>
      <div className="relative h-[calc(100dvh-22rem)] min-h-[320px] overflow-hidden rounded-2xl border border-line lg:h-[calc(100dvh-14rem)]">
        <Suspense fallback={<Skeleton className="size-full" />}><AtlasMap selected={city} onCityTap={setCity} /></Suspense>
        {city && cm && (
          <Card className="absolute inset-x-3 bottom-3 z-10 shadow-lg md:inset-x-auto md:right-3 md:w-80" role="dialog" aria-label={`${cm.name} details`}>
            <button className="absolute right-1 top-1 grid size-11 place-items-center text-ink-2" aria-label="Close" onClick={() => setCity(null)}><X size={18} /></button>
            <p className="eyebrow">{cm.country} · {cm.tag}</p>
            <p className="display text-2xl font-semibold">{cm.name} {cm.priority && <Chip tone="gold">Priority</Chip>}</p>
            {g ? (
              <p className="num mt-1 text-sm text-ink-2">From <b className="text-ink">{m(g.min_price)}</b> · {range(g.date_from, g.date_to)} · {dur(g.min_duration_min)} · {stops(g.min_stops).toLowerCase()}</p>
            ) : <p className="mt-1 text-sm text-ink-2">Not reachable from your current position with observed flights.</p>}
            <Button variant="primary" className="mt-3 w-full" onClick={() => setOpen(true)} disabled={!g}><Compass size={16} aria-hidden />Explore flights</Button>
          </Card>
        )}
      </div>
      <Sheet open={open} onOpenChange={setOpen} title={cm?.name ?? 'Flights'} description="Pick a flight to add it to your journey.">
        {open && <ExplorePanel parentNodeId={sc.focusId} initialCity={city} onAdded={() => { setOpen(false); setCity(null); }} />}
      </Sheet>
    </div>
  );
}
