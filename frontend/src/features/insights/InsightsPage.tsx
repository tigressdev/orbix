import { useNavigate } from 'react-router-dom';
import { Button, Card, Empty, ErrorNote, Skeleton } from '@/components/ui/primitives';
import { useInsights } from '@/services/api/queries';
import { useMetaOrThrow, useMoney } from '@/hooks/useStudioData';
import { fillMoney } from '@/lib/format';
import { useStudio } from '@/stores/studio';

/** Decision assistant: every card is computed on the server from observed offers. Nothing here is a forecast. */
export default function InsightsPage() {
  const q = useInsights();
  const meta = useMetaOrThrow();
  const m = useMoney();
  const currency = useStudio((s) => s.prefs.currency);
  const openTrip = useStudio((s) => s.openTrip);
  const viewOnly = useStudio((s) => s.viewOnly);
  const go = useNavigate();
  if (q.isLoading || q.data?.status === 'computing') return <div className="mx-auto flex max-w-3xl flex-col gap-3"><div><p className="eyebrow">Insights</p><h1 className="display text-4xl font-semibold leading-tight">Why a route is worth it</h1></div><p className="text-sm text-ink-2" aria-live="polite">Analysing every complete itinerary in the observed data…</p><Skeleton className="h-36" /><Skeleton className="h-36" /></div>;
  if (q.error || q.data?.status === 'error') return <ErrorNote error={q.error ?? q.data?.error} onRetry={() => q.refetch()} />;
  const d = q.data!;
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div><p className="eyebrow">Insights</p><h1 className="display text-4xl font-semibold leading-tight">Why a route is worth it</h1>
        <p className="text-sm text-ink-2">Computed from {d.complete_count ?? 0} complete itineraries in your observed data. Analysis, not a forecast.</p></div>
      {(d.highlights ?? []).map((h) => (
        <Card key={h.key} className="flex flex-col gap-2">
          <p className="eyebrow">{h.title}</p>
          <p className="display text-xl font-semibold leading-snug">{['Madrid', ...h.trip.cities, 'Madrid'].join(' → ')}</p>
          <p className="num text-sm">Total <b>{m(h.trip.summary.total)}</b> · flights {m(h.trip.summary.flights)} · stays {m(h.trip.summary.hotel)}{h.trip.metrics.flight_hours != null ? ` · ${h.trip.metrics.flight_hours} h in the air` : ''}</p>
          <p className="text-sm text-ink-2">{fillMoney(meta.fx, currency, h.subtitle)}</p>
          {h.reasons && h.reasons.length > 0 && <ul className="list-disc pl-5 text-sm">{h.reasons.map((r) => <li key={r}>{fillMoney(meta.fx, currency, r)}</li>)}</ul>}
          {!viewOnly && <Button size="sm" className="self-start" onClick={() => { openTrip(h.title, h.trip.legs); go('/'); }}>Open in my journey</Button>}
        </Card>
      ))}
      {!d.highlights?.length && <Empty title="No complete itinerary yet">Add observed flights that connect Madrid, Beijing and Moscow.</Empty>}
      {d.gaps && d.gaps.length > 0 && <Card className="text-sm text-ink-2">No observed flights yet for: {d.gaps.map((g) => g.name).join(', ')}.</Card>}
    </div>
  );
}
