import { AlertTriangle, ArrowRight, Briefcase, Plus } from 'lucide-react';
import { Button, Card, Chip } from '@/components/ui/primitives';
import { AirlineBadge } from '@/components/shared/AirlineLogo';
import { checkedBag } from '@/lib/baggage';
import { useMetaOrThrow, useMoney } from '@/hooks/useStudioData';
import { useStudio } from '@/stores/studio';
import { day, dur, observed, sourceLabel, stops, time } from '@/lib/format';
import type { FlightOption } from '@/types';

const bagLabel = (v: string) => (v === 'yes' || v === 'included' ? 'included' : v === 'no' || v === 'not_included' ? 'not included' : 'unknown');

export function FlightCard({ o, remaining, onAdd }: { o: FlightOption; remaining: number; onAdd: (o: FlightOption) => void }) {
  const m = useMoney();
  const meta = useMetaOrThrow();
  const viewOnly = useStudio((s) => s.viewOnly);
  const name = (code: string) => meta.airport_names[code] ?? code;
  const extra = Math.max(0, o.increment - o.price - o.hotel_before - o.transfer);
  const nextDay = o.dep_local.slice(0, 10) !== o.arr_local.slice(0, 10);
  const overBudget = remaining - o.increment < 0;
  const blocked = !o.ok;
  const bag = checkedBag(o.airlines, o.baggage.checked);
  return (
    <Card className={`flex flex-col gap-3 ${blocked ? 'opacity-70' : ''}`} aria-label={`${o.origin} to ${o.destination}, ${time(o.dep_local)}, ${m(o.price)}`}>
      <div className="flex items-start justify-between gap-3">
        <AirlineBadge airlines={o.airlines} flights={o.flights} />
        <div className="text-right">
          <p className="num display text-2xl font-bold leading-none">{m(o.price, o.fx_day)}</p>
          {o.native_currency && o.native_currency !== 'USD' && <p className="num mt-0.5 text-[11px] text-ink-2">{o.native_currency} {Math.round(o.native_price)} native</p>}
        </div>
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <div className="min-w-0"><p className="num display text-2xl font-bold leading-none">{time(o.dep_local)}</p><p className="mt-1 truncate text-xs text-ink-2">{o.origin} · {name(o.origin)}</p><p className="text-xs text-ink-2">{day(o.dep_local)}</p></div>
        <div className="flex min-w-14 flex-col items-center text-[11px] text-ink-2"><span className="num font-semibold">{dur(o.duration_min)}</span><ArrowRight size={16} aria-hidden /><span>{stops(o.stops)}</span></div>
        <div className="min-w-0 text-right"><p className="num display text-2xl font-bold leading-none">{time(o.arr_local)}{nextDay && <sup className="ml-0.5 text-[11px] text-ink-2">+{Math.max(1, Math.round((Date.parse(o.arr_local.slice(0, 10)) - Date.parse(o.dep_local.slice(0, 10))) / 864e5))}</sup>}</p><p className="mt-1 truncate text-xs text-ink-2">{o.destination} · {name(o.destination)}</p><p className="text-xs text-ink-2">{day(o.arr_local)}</p></div>
      </div>

      {(o.via.length > 0 || o.airport_change) && (
        <p className="text-xs text-ink-2">
          {o.via.length > 0 && <>Connections: {o.via.map((v) => `${v.airport} ${dur(v.minutes)}`).join(', ')}. </>}
          {o.airport_change && <>You will change airport in this city. </>}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        <Chip><Briefcase size={12} aria-hidden />Carry-on {bagLabel(o.baggage.carry_on)}</Chip>
        <span title={bag.hint}><Chip tone={bag.status === 'included' || bag.status === 'typical-included' ? 'good' : bag.status === 'typical-extra' || bag.status === 'varies' ? 'risk' : 'neutral'}>{bag.label}{bag.status.startsWith('typical') || bag.status === 'varies' ? ' *' : ''}</Chip></span>
        <Chip>seen {observed(o.observed_at)} · {sourceLabel(o.source)}</Chip>
        {o.stops > 0 && o.via.some((v) => v.minutes < 360) && <Chip tone="risk"><AlertTriangle size={12} aria-hidden />Short connection</Chip>}
      </div>

      {blocked ? (
        <div className="rounded-xl bg-bad-soft px-3 py-2 text-sm text-bad"><p className="font-semibold">Outside your rules</p><ul className="mt-0.5 list-disc pl-4">{o.why.map((w) => <li key={w}>{w}</li>)}</ul></div>
      ) : (
        <div className="rounded-xl bg-surface-2 px-3 py-2 text-sm">
          <p className="num flex flex-wrap gap-x-3 text-ink-2">
            <span>+{m(o.price, o.fx_day)} fare</span>{o.hotel_before > 0 && <span>+{m(o.hotel_before)} stay before</span>}{o.transfer > 0 && <span>+{m(o.transfer)} transfer</span>}{extra > 0 && <span>+{m(extra)} bags</span>}
          </p>
          <p className="num mt-1 font-semibold">Adds {m(o.increment)} · journey total {m(o.cumulative)} <span className={overBudget ? 'text-bad' : 'text-teal'}>({overBudget ? `${m(o.increment - remaining)} over` : `${m(remaining - o.increment)} left`})</span></p>
        </div>
      )}

      {(bag.status.startsWith('typical') || bag.status === 'varies') && <p className="text-[11px] text-ink-2">* {bag.hint}</p>}
      {!blocked && !viewOnly && <Button variant="primary" size="lg" className="w-full" onClick={() => onAdd(o)}><Plus size={18} aria-hidden />Add to journey</Button>}
    </Card>
  );
}
