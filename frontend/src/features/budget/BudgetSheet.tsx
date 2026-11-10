import { Sheet } from '@/components/ui/Sheet';
import { Card, Chip } from '@/components/ui/primitives';
import { useBudget, useMetaOrThrow, useMoney } from '@/hooks/useStudioData';
import { useStudio } from '@/stores/studio';
import { plural } from '@/lib/format';

function Row({ label, note, value, tone }: { label: string; note?: string; value: string; tone?: 'muted' }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2.5">
      <div className="min-w-0"><p className={`text-[15px] font-medium ${tone === 'muted' ? 'text-ink-2' : ''}`}>{label}</p>{note && <p className="text-xs text-ink-2">{note}</p>}</div>
      <p className="num shrink-0 text-[15px] font-semibold">{value}</p>
    </div>
  );
}

export function BudgetSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const b = useBudget();
  const meta = useMetaOrThrow();
  const m = useMoney();
  const prefs = useStudio((s) => s.prefs);
  const setPref = useStudio((s) => s.setPref);
  const viewOnly = useStudio((s) => s.viewOnly);
  const s = b.summary;
  const sharedNote = s && s.hotel_shared_nights ? `your half in China · ${plural(s.hotel_shared_nights, 'night', 'nights')} split` : 'estimated';
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Journey budget" description="Cash costs of the branch you are looking at. Observed fares and estimates are labelled apart.">
      {!s ? <p className="text-sm text-ink-2">Calculating this branch…</p> : (
        <div className="flex flex-col gap-4">
          <Card>
            <p className="eyebrow">Total on this branch</p>
            <p className="num display mt-1 text-4xl font-bold">{m(b.spent)}</p>
            <p className={`mt-1 text-sm font-semibold ${b.over ? 'text-bad' : 'text-teal'}`}>{b.over ? `${m(-b.remaining)} over budget` : `${m(b.remaining)} left of ${m(b.budget)}`}</p>
          </Card>

          <Card className="divide-y divide-line !py-1">
            <Row label="Flights" note="observed fares" value={m(s.flights)} />
            <Row label="Accommodation" note={sharedNote} value={m(s.hotel)} />
            <Row label="Baggage" note="estimated" value={m(s.bags)} />
            <Row label="Transfers" note="estimated" value={m(s.transfers)} />
            {b.purchased > 0 && <Row label="Confirmed purchase" note="São Paulo ⇄ Madrid, included by your choice" value={m(b.purchased)} />}
          </Card>

          {s.hotel_shared_nights > 0 && (
            <Card className="bg-teal-soft/60 text-sm">
              <b>China stays are split in two.</b> You and {meta.lodging.shared?.with ?? 'your travel companion'} share each private room, so you pay {m(s.hotel)} here instead of {m(s.hotel_full)} for the rooms (saving {m(s.hotel_saved)}).
            </Card>
          )}

          <Card>
            <div className="flex items-center justify-between gap-3">
              <div><p className="text-[15px] font-medium">Risk allowance</p><p className="text-xs text-ink-2">Not cash. It only ranks routes with short separate-ticket connections.</p></div>
              <Chip tone={s.risk > 0 ? 'risk' : 'neutral'}><span className="num">{m(s.risk)}</span></Chip>
            </div>
          </Card>

          <Card className="flex flex-col gap-3">
            <label className="flex min-h-11 items-center justify-between gap-3 text-[15px]">
              <span>Include the purchased São Paulo ⇄ Madrid ticket<span className="block text-xs text-ink-2">{meta.is_owner && meta.purchased_ticket.total_usd ? `${m(meta.purchased_ticket.total_usd)} · off by default` : 'kept apart from this budget'}</span></span>
              <input type="checkbox" className="size-6 accent-[var(--teal)]" checked={prefs.includePurchased} disabled={viewOnly || !meta.is_owner} onChange={(e) => setPref('includePurchased', e.target.checked)} />
            </label>
            <label className="flex min-h-11 items-center justify-between gap-3 text-[15px]">
              <span>Protect my birthday<span className="block text-xs text-ink-2">No flights on 14 March</span></span>
              <input type="checkbox" className="size-6 accent-[var(--teal)]" checked={prefs.protectBirthday} disabled={viewOnly} onChange={(e) => setPref('protectBirthday', e.target.checked)} />
            </label>
          </Card>
          {s.flags.length > 0 && <Card className="bg-risk-soft text-sm text-risk"><p className="font-semibold">Heads up</p><ul className="mt-1 list-disc pl-5">{s.flags.map((f) => <li key={f}>{f}</li>)}</ul></Card>}
        </div>
      )}
    </Sheet>
  );
}
