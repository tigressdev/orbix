import { useMemo, useState } from 'react';
import { ArrowLeft, ChevronRight, Lock } from 'lucide-react';
import { Card, Chip, Empty, ErrorNote, Skeleton } from '@/components/ui/primitives';
import { FlightCard } from './FlightCard';
import { useBudget, useMetaOrThrow, useMoney, useNextOptions } from '@/hooks/useStudioData';
import { useStudio } from '@/stores/studio';
import { plural, range, dur, stops } from '@/lib/format';
import type { DestinationGroup, FlightOption } from '@/types';

type Rank = 'cheapest' | 'fastest' | 'lowest_total' | 'interesting';
const RANKS: [Rank, string][] = [['cheapest', 'Cheapest'], ['lowest_total', 'Lowest total'], ['fastest', 'Fastest'], ['interesting', 'Most interesting']];

function rank(groups: DestinationGroup[], mode: Rank, required: string[]) {
  const by: Record<Rank, (a: DestinationGroup, b: DestinationGroup) => number> = {
    cheapest: (a, b) => a.min_price - b.min_price, fastest: (a, b) => a.min_duration_min - b.min_duration_min,
    lowest_total: (a, b) => a.min_cumulative - b.min_cumulative, interesting: (a, b) => b.interest - a.interest || a.min_cumulative - b.min_cumulative,
  };
  // open destinations first; locked mandatory ones (Moscow, Beijing) right after them so they never disappear
  const tier = (g: DestinationGroup) => (g.any_ok ? 0 : required.includes(g.city) ? 1 : 2);
  return [...groups].sort((a, b) => tier(a) - tier(b) || by[mode](a, b));
}

/** Destination explorer → flight alternatives, in one panel. The itinerary stays visible behind the sheet; going back keeps the selection. */
export function ExplorePanel({ parentNodeId, initialCity, onAdded }: { parentNodeId: string; initialCity?: string | null; onAdded?: () => void }) {
  const meta = useMetaOrThrow();
  const m = useMoney();
  const budget = useBudget();
  const q = useNextOptions(parentNodeId);
  const addLeg = useStudio((s) => s.addLeg);
  const viewOnly = useStudio((s) => s.viewOnly);
  const strict = useStudio((s) => s.prefs.strict);
  const setPref = useStudio((s) => s.setPref);
  const [mode, setMode] = useState<Rank>('cheapest');
  const [city, setCity] = useState<string | null>(initialCity ?? null);
  const [date, setDate] = useState('all');

  const groups = useMemo(() => {
    let g = q.data?.groups ?? [];
    if (strict) g = g.filter((x) => meta.required.includes(x.city) || (x.any_ok && budget.spent + (x.min_cumulative - (q.data?.summary.total ?? 0)) <= budget.budget));
    return rank(g, mode, meta.required);
  }, [q.data, mode, strict, meta.required, budget.spent, budget.budget]);

  if (q.isLoading) return <div className="flex flex-col gap-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-32" />)}</div>;
  if (q.error) return <ErrorNote error={q.error} onRetry={() => q.refetch()} />;
  const sel = city ? groups.find((g) => g.city === city) : null;

  if (sel) {
    const dates = [...new Set(sel.options.map((o) => o.dep_local.slice(0, 10)))].sort();
    const opts = sel.options.filter((o) => date === 'all' || o.dep_local.startsWith(date)).sort((a, b) => Number(b.ok) - Number(a.ok) || a.price - b.price || a.dep_local.localeCompare(b.dep_local));
    return (
      <div className="flex flex-col gap-3">
        <button onClick={() => { setCity(null); setDate('all'); }} className="inline-flex min-h-11 w-fit items-center gap-1.5 text-sm font-semibold text-teal"><ArrowLeft size={16} aria-hidden />All destinations</button>
        <div><p className="eyebrow">{sel.country} · {sel.tag}</p><h3 className="display text-3xl font-semibold">{sel.name}</h3>
          <p className="text-sm text-ink-2">{plural(sel.ok_count, 'option', 'options')} within your rules{sel.blocked_count ? ` · ${sel.blocked_count} outside` : ''} · stay {sel.stay_days[0] >= 1 ? `${sel.stay_days[0]}–${sel.stay_days[1]} days` : `up to ${sel.stay_days[1]} days`}</p></div>
        <div className="hscroll -mx-4 px-4" role="group" aria-label="Departure date">
          {['all', ...dates].map((d) => (
            <button key={d} aria-pressed={date === d} onClick={() => setDate(d)} className={`min-h-11 shrink-0 snap-start rounded-full border px-3.5 text-sm font-semibold ${date === d ? 'border-teal bg-teal text-white' : 'border-line bg-surface text-ink-2'}`}>
              {d === 'all' ? 'All dates' : range(d)}
            </button>
          ))}
        </div>
        {opts.map((o: FlightOption) => (
          <FlightCard key={o.key} o={o} remaining={budget.remaining} onAdd={(x) => { addLeg(parentNodeId, x); onAdded?.(); }} />
        ))}
        {!opts.length && <Empty title="No flights on that date" />}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="hscroll -mx-4 px-4" role="group" aria-label="Ranking">
        {RANKS.map(([k, label]) => (
          <button key={k} aria-pressed={mode === k} onClick={() => setMode(k)} className={`min-h-11 shrink-0 rounded-full border px-3.5 text-sm font-semibold ${mode === k ? 'border-ink bg-ink text-canvas' : 'border-line bg-surface text-ink-2'}`}>{label}</button>
        ))}
      </div>
      <label className="flex min-h-11 items-center justify-between gap-3 text-sm"><span>Hide options that break my rules or the budget<span className="block text-xs text-ink-2">Moscow and Beijing always stay visible</span></span>
        <input type="checkbox" className="size-6 accent-[var(--teal)]" checked={strict} onChange={(e) => setPref('strict', e.target.checked)} /></label>
      {viewOnly && <p className="text-sm text-lilac">Viewing only: you can browse, not add.</p>}
      {groups.map((g) => {
        const locked = !g.any_ok;
        const whys = g.options.flatMap((o) => o.why);
        const reason = whys.find((w) => w.startsWith('Order')) ?? whys.find((w) => w.includes('arrive between')) ?? whys[0];   // the rule that matters most first
        const over = g.min_cumulative - (q.data?.summary.total ?? 0) > budget.remaining;
        return (
          <button key={g.city} onClick={() => setCity(g.city)} className="text-left" aria-label={`${g.name}, from ${m(g.min_price)}`}>
            <Card className={`transition-colors hover:border-teal/50 ${locked ? 'opacity-75' : ''}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="eyebrow truncate">{g.country} · {g.tag}</p>
                  <p className="display mt-0.5 flex items-center gap-2 text-2xl font-semibold leading-tight">{g.name}{meta.required.includes(g.city) && <Chip tone="lilac">Required</Chip>}{meta.cities[g.city]?.priority && <Chip tone="gold">Priority</Chip>}</p>
                </div>
                <div className="text-right"><p className="text-[11px] text-ink-2">From</p><p className="num display text-2xl font-bold leading-none">{m(g.min_price)}</p></div>
              </div>
              <p className="mt-2 text-sm text-ink-2">{range(g.date_from, g.date_to)} · {dur(g.min_duration_min)} · {stops(g.min_stops).toLowerCase()} · stay {g.stay_days[0] >= 1 ? `${g.stay_days[0]}–${g.stay_days[1]} d` : `≤ ${g.stay_days[1]} d`}</p>
              {locked ? (
                <p className="mt-2 flex items-start gap-1.5 text-sm text-risk"><Lock size={14} className="mt-0.5 shrink-0" aria-hidden /><span>{reason ?? 'Outside your rules from here.'}</span></p>
              ) : (
                <p className="num mt-2 flex items-center justify-between gap-2 text-sm"><span>Projected total <b>{m(g.min_cumulative)}</b> <span className={over ? 'text-bad' : 'text-teal'}>· {over ? 'over budget' : `${m(budget.remaining - (g.min_cumulative - (q.data?.summary.total ?? 0)))} left`}</span></span><ChevronRight size={18} className="text-ink-2" aria-hidden /></p>
              )}
            </Card>
          </button>
        );
      })}
      {!groups.length && <Empty title="Nothing matches" >Turn off the filter to see every observed option.</Empty>}
    </div>
  );
}
