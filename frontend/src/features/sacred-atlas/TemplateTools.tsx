import { lazy, Suspense, useState } from 'react';
import { Button, Card, Skeleton } from '@/components/ui/primitives';
import { RouteDateSearch } from '@/components/shared/RouteDateSearch';
import { useFocusSummary, useMetaOrThrow, useMoney } from '@/hooks/useStudioData';
import { useStudio } from '@/stores/studio';
import { scenarioFromLegs } from '@/lib/tree';
import { siteById } from './data/sites';
import type { JourneyTemplate } from './types';

const SacredMap = lazy(() => import('./SacredMap'));

export function TemplateTools({ template: t, onSite }: { template: JourneyTemplate; onSite: (id: string, tab?: string) => void }) {
  const [mode, setMode] = useState<'explore' | 'dates' | 'compare' | null>(null);
  const [saved, setSaved] = useState(false);
  const viewOnly = useStudio((s) => s.viewOnly);
  const { summary } = useFocusSummary();
  const meta = useMetaOrThrow();
  const m = useMoney();
  const names = t.stops.map((s) => s.kind === 'site' ? siteById(s.id)!.name : meta.cities[s.id]?.name ?? s.id);
  const next = t.stops[1]!;
  const city = next.kind === 'city' ? next.id : siteById(next.id)?.nearbyTransportHubs.find((h) => h.city)?.city;
  const save = () => {
    const sc = scenarioFromLegs(`Research · ${t.title}`, []);
    sc.research = { templateId: t.id, note: `${names.join(' → ')}. Editorial route only: dates, connecting transport and total additional cost are unvalidated. ${t.note}` };
    if (useStudio.getState().addScenario(sc, `Saved editorial template: ${t.title}`)) setSaved(true);
  };
  return <div className="flex min-w-0 flex-col gap-3">
    <div className="flex flex-wrap gap-2">
      <Button size="sm" aria-pressed={mode === 'explore'} onClick={() => setMode(mode === 'explore' ? null : 'explore')}>Explore route</Button>
      <Button size="sm" aria-pressed={mode === 'dates'} onClick={() => setMode(mode === 'dates' ? null : 'dates')}>Search flexible dates</Button>
      <Button size="sm" aria-pressed={mode === 'compare'} onClick={() => setMode(mode === 'compare' ? null : 'compare')}>Compare with current journey</Button>
      <Button size="sm" disabled={viewOnly || saved} onClick={save}>{saved ? 'Saved as research alternative' : 'Save as alternative'}</Button>
    </div>
    {saved && <p role="status" className="text-sm text-teal">Saved independently as an incomplete research scenario. Your active journey is unchanged.</p>}
    {mode === 'explore' && <>
      <div className="h-80 overflow-hidden rounded-xl"><Suspense fallback={<Skeleton className="size-full" />}><SacredMap templateId={t.id} layers={{ journey: true, sites: true, traditions: false, festivals: false, routes: true }} selected={null} onSelect={onSite} /></Suspense></div>
      <p className="text-xs text-ink-2">Schematic cultural path, not validated transport. Select a place for cultural highlights and journey impact.</p>
    </>}
    {mode === 'dates' && (city ? <RouteDateSearch initialFrom="MADRID" initialTo={city} initialDate="2027-02-12" open /> : <p className="text-sm text-risk">The first gateway has no supported airport pair. Transport requires verification.</p>)}
    {mode === 'compare' && <Card className="text-sm">
      <p>Current journey priced cash: <b className="num">{summary ? m(summary.total) : 'Unavailable'}</b>{summary && !summary.complete ? ' · incomplete' : ''}</p>
      <p className="mt-2">Template additional cost: <b>Unknown</b>. Flight dates, local transport, accommodation, baggage and access costs require validation for the whole path. Shared flights must be counted once by the server.</p>
      <p className="mt-2">Impact: replaces the proposed cultural path with {names.join(' → ')}. Beijing must be the first China stop, Moscow remains required, 14 March stays protected, and Madrid return by 24 March is preferred.</p>
      <p className="mt-2 text-risk">{t.note} No total or savings claim is available until these restrictions and compatible observed flights are resolved.</p>
    </Card>}
  </div>;
}
