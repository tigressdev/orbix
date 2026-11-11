import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FlexibleDateSelector } from '@/components/shared/FlexibleDateSelector';
import { Card, Chip, ErrorNote } from '@/components/ui/primitives';
import { useChapters, useMetaOrThrow, useMoney, useParams } from '@/hooks/useStudioData';
import { fetchCorridors } from '@/services/api/flexible';

export function ReturnCorridors() {
  const params = useParams();
  const m = useMoney();
  const meta = useMetaOrThrow();
  const { nodes } = useChapters();
  const departure = nodes.find((n) => n.leg && meta.airports[n.leg.origin] === 'MOSCOW')?.leg?.dep_local.slice(0, 10);
  const [value, setValue] = useState({ preferred: departure ?? '2027-03-20', flex: 2 });
  const valid = value.preferred >= '2027-02-12' && value.preferred <= '2027-03-25';
  const q = useQuery({ queryKey: ['flex-corridors', value, params], queryFn: () => fetchCorridors(value, params), enabled: valid, staleTime: 60_000 });
  return <section className="flex min-w-0 flex-col gap-4" aria-label="Return corridor comparison" data-testid="return-corridors">
    <div><h2 className="display text-3xl font-semibold">The way home</h2><p className="text-sm text-ink-2">Moscow → Madrid. Observed transport, estimated stays and unresolved costs, compared separately from your existing journey.</p></div>
    <FlexibleDateSelector from="MOSCOW" to="ISTANBUL" value={value} onChange={setValue} />
    {q.isFetching && <p role="status">Checking compatible return corridors…</p>}
    {q.error && <ErrorNote error={q.error} onRetry={() => q.refetch()} />}
    {valid && q.data?.corridors.map((c) => <Card key={c.id} className="flex flex-col gap-3">
      <h3 className="display text-xl font-semibold">{c.label}</h3>
      <Chip className="max-w-full self-start whitespace-normal" tone={c.status === 'research_only' ? 'bad' : c.status === 'incomplete' ? 'risk' : 'teal'}>{c.status === 'research_only' ? 'Safety restricted — research only' : c.status === 'incomplete' ? 'Incomplete — missing compatible quotations' : 'Date-compatible observed corridor'}</Chip>
      {c.chain.includes('TEL_AVIV') && <p className="text-sm">Jerusalem is a cultural stopover reached by local transfers from Tel Aviv. Transfer schedules, prices, entry requirements and current safety must be verified; this corridor is not bookable advice.</p>}
      {Object.values(c.restricted).map((r) => <p key={r} className="text-sm text-risk">{r}</p>)}
      <ul className="text-sm text-ink-2">{c.legs.map((l, i) => <li key={i}>{l.from_name} → {l.to_name}: {l.observed}/{l.days.length} dates with observed quotes · {l.needs_quote} need quotation</li>)}</ul>
      {c.best ? <>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">{([
          ['Observed airfares', m(c.best.flights)], ['Accommodation estimate', m(c.best.hotel)], ['Baggage allowance estimate', m(c.best.bags)], ['Transfer allowance estimate', m(c.best.transfers)],
          ['Priced cash subtotal', m(c.best.total)], ['Difference vs cheapest unrestricted corridor', c.delta_vs_best_safe == null ? 'Unavailable' : m(c.delta_vs_best_safe)],
          ['Intermediate nights', String(c.best.nights_total)], ['Elapsed travel and stopover time', `${c.best.duration_hours} h`],
          ['Departure', c.best.depart_local], ['Madrid arrival', c.best.arrive_local], ['Margin before hard arrival deadline', `${c.best.slack_hours_to_return ?? 'Unknown'} h`],
          ['Preferred return buffer', c.best.fragile_return ? 'Fragile: after 24 March' : 'Arrives by 24 March'],
        ]).map(([label, v]) => <div key={label} className="min-w-0"><dt className="text-ink-2">{label}</dt><dd className="num font-semibold">{v}</dd></div>)}</dl>
        <p className="text-xs text-ink-2">Observed {c.best.observed_at.slice(0, 10)} · {c.option_count} compatible combination(s). Cash excludes non-cash risk penalties and confirmed tickets. These are corridor costs, not the cost of a complete journey.</p>
        <p className="text-sm">{c.best.flags.length ? c.best.flags.join(' · ') : 'No short-connection or late-return flags in this corridor.'} Separate tickets still require connection verification.</p>
        <details><summary className="min-h-11 cursor-pointer font-semibold">Observed flights and other combinations</summary>{c.options.map((o, i) => <div key={i} className="border-t border-line py-3 text-sm"><p className="font-semibold">{m(o.total)} priced cash · {o.nights_total} night(s){o.pareto ? ' · Pareto frontier' : ''}</p>{o.legs.map((l) => <p key={l.key}>{l.origin} → {l.destination} · {l.dep_local} → {l.arr_local} · {l.airlines} · {m(l.price)}</p>)}</div>)}</details>
      </> : <p className="text-sm">Total unknown. {c.missing_legs.length ? `Missing coverage: ${c.missing_legs.join(', ')}.` : 'Observed legs do not form a compatible chain within these dates and stay limits.'}</p>}
      <p className="text-xs text-risk">Still unpriced or unverified: {c.unpriced.join('; ')}. Allowances above are estimates, not supplier quotes. Full-journey compatibility, Beijing before Moscow and the confirmed return must also be validated.</p>
    </Card>)}
  </section>;
}
