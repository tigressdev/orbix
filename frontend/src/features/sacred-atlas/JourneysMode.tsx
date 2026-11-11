import { useMemo } from 'react';
import { ArrowRight, Info } from 'lucide-react';
import { clsx } from 'clsx';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Card } from '@/components/ui/primitives';
import { useMetaOrThrow, useMoney } from '@/hooks/useStudioData';
import { useTrends } from '@/services/api/queries';
import { SITES, siteById } from './data/sites';
import { TEMPLATES } from './data/journeys';
import { TRADITION_LABEL } from './data/traditions';
import { siteFeasibility, worst, FEAS_LABEL } from './engine/feasibility';
import { coverage, rankKey, type SacredPrefs } from './engine/preferences';
import type { AltPlan } from './engine/alternatives';
import { useSacredPrefs } from './useSacred';
import { FeasBadge } from './ui';
import { Bar } from './SiteSheet';
import type { Feasibility, TraditionId } from './types';

const WINDOW_DAYS = 41; // 12 Feb (first day after landing in Madrid) → 25 Mar (must be back in Madrid before the confirmed flight)

export default function JourneysMode({ onSite }: { onSite: (id: string, tab?: string) => void }) {
  return (
    <section className="flex flex-col gap-6" aria-label="Journey alternatives">
      <div><h2 className="display text-3xl font-semibold">Journey alternatives</h2>
        <p className="max-w-2xl text-ink-2">Start from a place, see what it does to the plan you already have, and save it as a separate branch. Your active journey is never overwritten.</p></div>
      <Card className="flex items-start gap-3 bg-teal-soft/50 text-sm"><Info size={18} className="mt-0.5 shrink-0 text-teal" aria-hidden />
        <p>Fixed constraints on every alternative: land in Madrid 11 Feb 22:35, fly home from Madrid 25 Mar 22:30 (with the return buffer the route engine enforces), Beijing and Moscow required, no flights on 14 March.</p></Card>
      <Templates onSite={onSite} />
      <Economics onSite={onSite} />
    </section>
  );
}

function Templates({ onSite }: { onSite: (id: string, tab?: string) => void }) {
  const meta = useMetaOrThrow();
  const trends = useTrends();
  const airportsOf = (city: string) => Object.entries(meta.airports).filter(([, c]) => c === city).map(([a]) => a);
  const cityOfStop = (id: string, kind: 'city' | 'site') => (kind === 'city' ? id : siteById(id)?.nearbyTransportHubs.find((h) => h.city && meta.cities[h.city])?.city ?? null);
  const observed = (a: string | null, b: string | null) => {
    if (!a || !b) return false;
    const A = airportsOf(a), B = airportsOf(b);
    return (trends.data?.routes ?? []).some((r) => A.includes(r.from) && B.includes(r.to));
  };
  return (
    <div className="flex flex-col gap-3">
      <h3 className="display text-2xl font-semibold">Thematic journeys</h3>
      <p className="text-sm text-ink-2">Editorial starting configurations, not promises of available travel.</p>
      {TEMPLATES.map((t) => {
        const states: Feasibility[] = t.stops.map((s) => (s.kind === 'site' ? siteFeasibility(siteById(s.id)!).status : 'explorable'));
        const f = worst(states);
        const days = t.stops.reduce((a, s) => a + (s.kind === 'site' ? siteById(s.id)!.suggestedDuration?.minDays ?? 1 : s.id === 'MADRID' ? 0 : Math.round((meta.stay_rules_hours[s.id]?.min ?? 24) / 24)), 0) + (t.stops.length - 1);
        const hops = t.stops.slice(1).map((s, i) => { const prev = t.stops[i]!; const a = cityOfStop(prev.id, prev.kind), b = cityOfStop(s.id, s.kind); return { from: prev, to: s, same: !!a && a === b, obs: observed(a, b) }; });
        return (
          <Card key={t.id} className="flex flex-col gap-3" data-testid={`template-${t.id}`} data-feasibility={f}>
            <div className="flex flex-wrap items-start justify-between gap-2"><p className="display text-2xl font-semibold leading-tight">{t.title}</p><FeasBadge s={f} /></div>
            <p className="text-sm text-ink-2">{t.focus}</p>
            <ol className="flex flex-wrap items-center gap-1 text-sm">
              {t.stops.map((s, i) => {
                const name = s.kind === 'site' ? siteById(s.id)!.name : meta.cities[s.id]?.name ?? s.id;
                return <li key={i} className="flex items-center gap-1">{i > 0 && <ArrowRight size={12} className="text-ink-2" aria-hidden />}
                  {s.kind === 'site' ? <button onClick={() => onSite(s.id)} className={clsx('min-h-9 rounded-full border px-2.5 font-semibold', s.conditional ? 'border-dashed border-risk text-risk' : 'border-line text-teal')}>{name}</button> : <span className="font-semibold">{name}</span>}</li>;
              })}
            </ol>
            <ul className="grid gap-1 text-xs sm:grid-cols-2">
              {hops.map((h, i) => (
                <li key={i} className="flex items-center justify-between gap-2 rounded-lg bg-surface-2 px-2 py-1.5">
                  <span>{label(h.from, meta)} → {label(h.to, meta)}</span>
                  <span className={h.same ? 'text-teal' : h.obs ? 'text-good' : 'text-risk'}>{h.same ? 'chapter, no flight' : h.obs ? 'observed fares' : 'requires verification'}</span>
                </li>
              ))}
            </ul>
            <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
              <div><p className="eyebrow !text-[10px]">Minimum days</p><p className={clsx('num font-semibold', days > WINDOW_DAYS && 'text-bad')}>{days} of {WINDOW_DAYS}</p></div>
              <div><p className="eyebrow !text-[10px]">Return</p><p className="font-semibold">Madrid by 25 Mar</p></div>
              <div><p className="eyebrow !text-[10px]">Status</p><p className="font-semibold">{f === 'explorable' ? 'Can be planned' : `Not feasible yet: ${FEAS_LABEL[f].toLowerCase()}`}</p></div>
            </div>
            <p className="text-xs text-ink-2">{t.note} Minimum days are an editorial estimate (site durations + required-city minimum stays + one travel day per hop), not a schedule.</p>
          </Card>
        );
      })}
    </div>
  );
}
const label = (s: { id: string; kind: 'city' | 'site' }, meta: ReturnType<typeof useMetaOrThrow>) => (s.kind === 'site' ? siteById(s.id)!.name : meta.cities[s.id]?.name ?? s.id);

const SLIDERS: { k: keyof Omit<SacredPrefs, 'traditions'>; label: string }[] = [
  { k: 'traditionInterest', label: 'Traditions you chose' }, { k: 'historicalInterest', label: 'Historical significance' }, { k: 'landscapeInterest', label: 'Landscape' },
  { k: 'festivalInterest', label: 'Festivals' }, { k: 'practiceInterest', label: 'Living practice' }, { k: 'budgetSensitivity', label: 'Cost matters' }, { k: 'timeSensitivity', label: 'Time matters' },
];

function Economics({ onSite }: { onSite: (id: string, tab?: string) => void }) {
  const [p, setP] = useSacredPrefs();
  const m = useMoney();
  const qc = useQueryClient();
  const plans = qc.getQueriesData<AltPlan>({ queryKey: ['sacred-plan'] });
  const planOf = (id: string) => plans.map(([, d]) => d).filter((d): d is AltPlan => !!d && d.site.id === id).pop();
  const ranked = useMemo(() => SITES.map((s) => {
    const cov = coverage(s, p).score;
    const plan = planOf(s.id);
    const usd = plan?.delta?.total ?? null;
    const days = plan ? plan.extraDays : s.suggestedDuration?.minDays ?? 1;
    return { s, cov, plan, usd, days, key: rankKey(cov, usd, days, p) };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }).sort((a, b) => b.key - a.key), [p, plans.length]);
  const toggleT = (t: TraditionId) => setP({ ...p, traditions: p.traditions.includes(t) ? p.traditions.filter((x) => x !== t) : [...p.traditions, t] });
  return (
    <div className="flex flex-col gap-3">
      <h3 className="display text-2xl font-semibold">Cultural value versus economic cost</h3>
      <p className="text-sm text-ink-2">Two independent dimensions. Coverage comes from your weights below and the catalog’s editorial descriptors; cost and days come from the route engine once you evaluate a place. No place has a universal spiritual score.</p>
      <Card className="grid gap-3 sm:grid-cols-2">
        {SLIDERS.map(({ k, label: l }) => (
          <label key={k} className="flex flex-col gap-1 text-sm"><span className="flex justify-between"><span className="font-semibold">{l}</span><span className="num text-ink-2">{p[k]}/3</span></span>
            <input type="range" min={0} max={3} step={1} value={p[k]} onChange={(e) => setP({ ...p, [k]: Number(e.target.value) })} className="accent-[var(--teal)]" /></label>
        ))}
        <div className="flex flex-wrap gap-1.5 sm:col-span-2" role="group" aria-label="Traditions of interest">
          {(['chinese-buddhism', 'tibetan-buddhism', 'daoism', 'judaism', 'christianity', 'islam', 'hinduism'] as TraditionId[]).map((t) => (
            <button key={t} aria-pressed={p.traditions.includes(t)} onClick={() => toggleT(t)} className={clsx('min-h-9 rounded-full border px-3 text-xs font-semibold', p.traditions.includes(t) ? 'border-teal bg-teal-soft text-teal' : 'border-line text-ink-2')}>{TRADITION_LABEL[t]}</button>
          ))}
        </div>
        <p className="text-xs text-ink-2 sm:col-span-2">Ranking = coverage − (cost weight ÷ 3) × ½ × extra cost (capped at $1,500) − (time weight ÷ 3) × ½ × extra days (capped at 7). Places not yet evaluated use a neutral cost and their editorial duration.</p>
      </Card>
      <ol className="flex flex-col gap-2" data-testid="ranking">
        {ranked.map(({ s, cov, plan, usd, days }, i) => (
          <li key={s.id}><Card className="flex flex-col gap-2">
            <div className="flex items-start justify-between gap-2">
              <div><p className="eyebrow !text-[10px]">#{i + 1} · {s.region}</p><p className="display text-xl font-semibold">{s.name}</p></div>
              <FeasBadge s={plan?.feasibility ?? siteFeasibility(s).status} />
            </div>
            <Bar label="Coverage of your interests" value={cov} tone="teal" />
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="num">{plan ? <>Priced difference <b>{usd == null ? '—' : (usd >= 0 ? '+' : '−') + m(Math.abs(usd))}</b> · {days} extra day(s)</> : <span className="text-ink-2">Cost not evaluated · about {days} day(s) on site</span>}</span>
              <Button size="sm" onClick={() => onSite(s.id, 'impact')}>{plan ? 'Review impact' : 'Evaluate'}</Button>
            </div>
          </Card></li>
        ))}
      </ol>
    </div>
  );
}
