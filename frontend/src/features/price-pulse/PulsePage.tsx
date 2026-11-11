import { RouteDateSearch } from '@/components/shared/RouteDateSearch';
import { useMemo, useState } from 'react';
import { Area, AreaChart, ResponsiveContainer, YAxis } from 'recharts';
import { ArrowDown, ArrowRight, ArrowUp, Eye, Minus } from 'lucide-react';
import { Card, Chip, Empty, ErrorNote, Skeleton } from '@/components/ui/primitives';
import { useTrends } from '@/services/api/queries';
import { useMoney } from '@/hooks/useStudioData';
import { observed } from '@/lib/format';
import type { TrendRoute } from '@/types';

type Filter = 'all' | 'up' | 'down' | 'baseline' | 'watch';
type Sort = 'change' | 'price' | 'fresh';
const STATUS = {
  up: { label: 'Rising', tone: 'bad' as const, icon: ArrowUp }, down: { label: 'Falling', tone: 'good' as const, icon: ArrowDown },
  flat: { label: 'Stable', tone: 'neutral' as const, icon: Minus }, baseline: { label: 'Baseline only', tone: 'neutral' as const, icon: Eye },
};
const WATCH_KEY = 'orbix.watchlist';
const loadWatch = (): string[] => { try { return JSON.parse(localStorage.getItem(WATCH_KEY) ?? '[]') as string[]; } catch { return []; } };

function Spark({ r }: { r: TrendRoute }) {
  if (r.history.length < 2) return <p className="text-xs text-ink-2">Needs 2 days of observations</p>;   // a one-day baseline is never presented as a trend
  const tone = r.trend.status === 'up' ? 'var(--bad)' : r.trend.status === 'down' ? 'var(--good)' : 'var(--ink-2)';
  return (
    <div className="h-12 w-full" aria-hidden>
      <ResponsiveContainer width="100%" height="100%"><AreaChart data={r.history} margin={{ top: 4, bottom: 2, left: 2, right: 2 }}>
        <YAxis hide domain={['dataMin - 20', 'dataMax + 20']} />
        <Area type="monotone" dataKey="min_usd" stroke={tone} fill={tone} fillOpacity={0.12} strokeWidth={2} dot={{ r: 2.5 }} isAnimationActive={false} />
      </AreaChart></ResponsiveContainer>
    </div>
  );
}

export default function PulsePage() {
  const q = useTrends();
  const m = useMoney();
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('change');
  const [watch, setWatch] = useState<string[]>(loadWatch);
  const toggle = (c: string) => setWatch((w) => { const n = w.includes(c) ? w.filter((x) => x !== c) : [...w, c]; try { localStorage.setItem(WATCH_KEY, JSON.stringify(n)); } catch { /* storage off */ } return n; });
  const rows = useMemo(() => {
    const r = (q.data?.routes ?? []).filter((x) => filter === 'all' || (filter === 'watch' ? watch.includes(x.code) : x.trend.status === filter));
    return [...r].sort((a, b) => sort === 'price' ? a.cheapest_usd - b.cheapest_usd : sort === 'fresh' ? a.age_days - b.age_days : Math.abs(b.trend.pct ?? 0) - Math.abs(a.trend.pct ?? 0));
  }, [q.data, filter, sort, watch]);
  if (q.isLoading) return <div className="mx-auto flex max-w-3xl flex-col gap-3"><Skeleton className="h-24" /><Skeleton className="h-40" /><Skeleton className="h-40" /></div>;
  if (q.error) return <ErrorNote error={q.error} onRetry={() => q.refetch()} />;
  const s = q.data!.summary;
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div><p className="eyebrow">Price Pulse</p><h1 className="display text-4xl font-semibold leading-tight">Where prices are moving</h1></div>
      <RouteDateSearch />
      <Card className="grid grid-cols-3 gap-2 text-center">
        <div><p className="num display text-3xl font-bold text-bad">{s.rising}</p><p className="text-xs text-ink-2">rising</p></div>
        <div><p className="num display text-3xl font-bold text-good">{s.falling}</p><p className="text-xs text-ink-2">falling</p></div>
        <div><p className="num display text-3xl font-bold">{s.stable}</p><p className="text-xs text-ink-2">stable</p></div>
        <p className="col-span-3 border-t border-line pt-2 text-xs text-ink-2">{s.routes} routes · {s.offers} offers · {s.snapshot_days} snapshot {s.snapshot_days === 1 ? 'day' : 'days'} ({s.first_day} → {s.last_day}) · {s.baseline} still baseline only{s.stale ? ` · ${s.stale} stale` : ''}</p>
      </Card>
      <div className="hscroll -mx-4 px-4" role="group" aria-label="Filter">
        {([['all', 'All'], ['up', 'Rising'], ['down', 'Falling'], ['baseline', 'Baseline'], ['watch', `Watching (${watch.length})`]] as [Filter, string][]).map(([k, l]) => (
          <button key={k} aria-pressed={filter === k} onClick={() => setFilter(k)} className={`min-h-11 shrink-0 rounded-full border px-3.5 text-sm font-semibold ${filter === k ? 'border-ink bg-ink text-canvas' : 'border-line bg-surface text-ink-2'}`}>{l}</button>
        ))}
      </div>
      <label className="flex items-center gap-2 text-sm text-ink-2">Sort by
        <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="min-h-11 rounded-lg border border-line bg-surface px-2 text-ink"><option value="change">Biggest change</option><option value="price">Lowest price</option><option value="fresh">Most recent</option></select>
      </label>
      {rows.map((r) => {
        const st = r.stale ? { label: 'Stale', tone: 'risk' as const, icon: Minus } : STATUS[r.trend.status];
        const Icon = st.icon;
        return (
          <Card key={r.code} className="flex flex-col gap-2">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0"><p className="eyebrow">{r.code.replace('_', ' → ')}</p><p className="display text-xl font-semibold leading-tight">{r.from} <ArrowRight size={14} className="inline text-ink-2" aria-hidden /> {r.to}</p></div>
              <div className="text-right"><p className="num display text-2xl font-bold leading-none">{m(r.cheapest_usd)}</p>
                <Chip tone={st.tone} className="mt-1"><Icon size={12} aria-hidden />{st.label}{r.trend.pct != null && r.trend.status !== 'baseline' ? ` ${r.trend.pct > 0 ? '+' : ''}${r.trend.pct.toFixed(1)}%` : ''}</Chip></div>
            </div>
            <Spark r={r} />
            <div className="flex items-center justify-between gap-2 text-xs text-ink-2">
              <span>Last observed {observed(r.latest_day)} · dep {r.cheapest_dep} · {r.cheapest_stops === 0 ? 'nonstop' : `${r.cheapest_stops} stop${r.cheapest_stops > 1 ? 's' : ''}`}</span>
              <button aria-pressed={watch.includes(r.code)} onClick={() => toggle(r.code)} className={`inline-flex min-h-11 items-center gap-1 rounded-full px-3 font-semibold ${watch.includes(r.code) ? 'bg-teal-soft text-teal' : 'border border-line'}`}><Eye size={14} aria-hidden />{watch.includes(r.code) ? 'Watching' : 'Watch'}</button>
            </div>
          </Card>
        );
      })}
      {!rows.length && <Empty title="No routes match" />}
      <p className="text-xs text-ink-2">Watching is a personal shortlist on this device. No notification delivery is configured, so nothing will alert you yet.</p>
    </div>
  );
}
