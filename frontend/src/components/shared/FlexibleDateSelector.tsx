import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useMoney, useParams } from '@/hooks/useStudioData';
import { fetchCoverage, type DateChoice } from '@/services/api/flexible';
import { Button, ErrorNote } from '@/components/ui/primitives';
import { day } from '@/lib/format';

/** Date preferences only. Coverage and constraints belong to the Python engine. */
export function FlexibleDateSelector({ from, to, value, onChange }: {
  from: string; to: string; value: DateChoice; onChange: (v: DateChoice) => void;
}) {
  const params = useParams();
  const m = useMoney();
  const [custom, setCustom] = useState(value.flex > 3);
  const valid = /^2027-\d{2}-\d{2}$/.test(value.preferred) && value.preferred >= '2027-02-12' && value.preferred <= '2027-03-25' && from !== to;
  const q = useQuery({ queryKey: ['flex-coverage', from, to, value, params], queryFn: () => fetchCoverage(from, to, value, params), enabled: valid, staleTime: 60_000 });
  return <section className="flex min-w-0 flex-col gap-3" aria-label="Flexible departure dates" data-testid="flexible-dates">
    <div className="flex flex-wrap items-end gap-3">
      <label className="flex min-w-0 flex-col gap-1 text-sm font-semibold">Preferred departure
        <input className="min-h-11 max-w-full rounded-lg border border-line bg-surface px-3 text-ink" type="date" min="2027-02-12" max="2027-03-25" value={value.preferred} onChange={(e) => onChange({ ...value, preferred: e.target.value })} />
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold">Flexibility
        <select className="min-h-11 rounded-lg border border-line bg-surface px-3 text-ink" value={custom ? 'custom' : value.flex} onChange={(e) => { setCustom(e.target.value === 'custom'); if (e.target.value !== 'custom') onChange({ ...value, flex: Number(e.target.value) }); }}>
          <option value={0}>Exact date</option>{[1, 2, 3].map((n) => <option key={n} value={n}>±{n} day{n > 1 ? 's' : ''}</option>)}<option value="custom">Custom flexibility</option>
        </select>
      </label>
      {custom && <label className="flex flex-col gap-1 text-sm">Days either side (0–7)<input className="min-h-11 w-24 rounded-lg border border-line bg-surface px-3" type="number" min={0} max={7} value={value.flex} onChange={(e) => onChange({ ...value, flex: Math.max(0, Math.min(7, Number(e.target.value))) })} /></label>}
    </div>
    {!valid && <p role="status" className="text-sm text-risk">Choose different cities and a date between 12 February and 25 March 2027.</p>}
    {q.isFetching && <p role="status" className="text-sm text-ink-2">Checking observed quotations…</p>}
    {q.error && <ErrorNote error={q.error} onRetry={() => q.refetch()} />}
    {valid && q.data && !q.error && <>
      <p className="text-sm font-semibold">{q.data.from_name} → {q.data.to_name}</p>
      {q.data.research_only && <p className="text-sm text-risk">Safety restricted — research only. {q.data.research_only}</p>}
      <div className="flex max-w-full gap-2 overflow-x-auto pb-2" tabIndex={0} aria-label="Candidate departure dates">
        {q.data.days.map((d) => <div key={d.date} className={`flex w-36 shrink-0 flex-col gap-1 rounded-xl border p-3 ${d.preferred ? 'border-teal bg-teal-soft' : 'border-line bg-surface'}`}>
          <button type="button" className="min-h-11 text-left font-semibold underline underline-offset-4 disabled:no-underline" disabled={d.status === 'protected'} aria-pressed={d.preferred} aria-label={`Prefer ${d.date}`} onClick={() => onChange({ ...value, preferred: d.date })}>{day(d.date)}{d.preferred && <span className="block text-xs text-teal">Preferred</span>}</button>
          <b className="num text-sm">{d.status === 'observed' && d.min_price != null ? m(d.min_price) : d.status === 'protected' ? 'Blocked' : 'Needs quotation'}</b>
          <span className="text-xs text-ink-2">{d.status === 'observed' ? `${d.offers} observed offer(s)` : d.status === 'stale' ? 'Stale coverage' : d.status === 'protected' ? 'Protected: no flying' : 'No quote coverage'}</span>
          {d.observed_at && <span className="text-xs text-ink-2">Observed {d.observed_at.slice(0, 10)}</span>}
          {d.status !== 'protected' && <a className="mt-auto py-2 text-xs font-semibold text-teal underline" href={d.url} target="_blank" rel="noreferrer">Check live fare</a>}
        </div>)}
      </div>
      {!q.data.days.length && <p role="status">No candidate dates inside the hard limits.</p>}
    </>}
    <p className="text-xs text-ink-2">Observed prices are not bookings. Missing and stale quotes need verification. This preference leaves your saved journey unchanged.</p>
    {q.error && <Button size="sm" onClick={() => q.refetch()}>Retry coverage</Button>}
  </section>;
}
