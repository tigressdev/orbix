import { useState } from 'react';
import { CalendarSearch, ChevronDown, ChevronUp, ClipboardCopy, ExternalLink, Lock, Send, ShieldAlert } from 'lucide-react';
import { Button, Card, Chip } from '@/components/ui/primitives';
import { useMoney } from '@/hooks/useStudioData';
import { day } from '@/lib/format';
import { collectorText, localRequests, requestQuotes, type Candidate, type CandidateDay } from '@/services/api/discover';

const STATE: Record<Candidate['state'], { label: string; tone: 'teal' | 'gold' | 'risk' | 'neutral' | 'lilac' | 'bad' }> = {
  observed: { label: 'Quoted', tone: 'teal' }, stale: { label: 'Quotes out of date', tone: 'gold' }, missing: { label: 'Needs quotes', tone: 'risk' },
  temporally_blocked: { label: 'No date fits', tone: 'neutral' }, research_only: { label: 'Research only', tone: 'bad' }, confirmed: { label: 'Booked', tone: 'lilac' },
};
const DAY: Record<CandidateDay['status'], string> = {
  observed: 'Observed fare', observed_blocked: 'Fare breaks a rule', stale: 'Quote out of date', missing: 'Needs quotation',
};

/** A next destination that may have no observed fare yet. It can be explored and its quotes requested, but it is never bookable from
 *  here: only an observed, valid flight (shown in the destination's flight list) can be added to the journey. */
export function CandidateCard({ c, label, onSeeFlights, viewOnly }: { c: Candidate; label: string; onSeeFlights?: (city: string) => void; viewOnly?: boolean }) {
  const m = useMoney();
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const st = STATE[c.state];
  const span = c.dates.length ? `${day(c.dates[0]!.date)} – ${day(c.dates[c.dates.length - 1]!.date)}` : null;
  const gaps = c.jobs.filter((j) => !j.research_only || c.research_only);
  const reasons = Object.entries(c.excluded).filter(([, d]) => d.length || c.state === 'temporally_blocked').map(([r]) => r);
  const request = async () => {
    setBusy(true);
    try {
      const r = await requestQuotes(gaps, label);
      setMsg(r.where === 'server' ? `${r.saved} search(es) added to the collection queue. Prices appear after they are collected.`
        : 'Saved in this browser (the online app is read-only). Copy the list for the collector.');
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(collectorText(localRequests())); setMsg('Copied. Save it as data/queue/requests.jsonl for the collector.'); }
    catch { setMsg('Copy failed: your browser blocked the clipboard.'); }
  };
  return (
    <Card className="flex flex-col gap-2" data-testid={`candidate-${c.city}`} data-state={c.state}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow truncate">{c.country}{c.tag ? ` · ${c.tag}` : ''}</p>
          <p className="display mt-0.5 flex flex-wrap items-center gap-2 text-2xl font-semibold leading-tight">{c.name}
            {c.required && <Chip tone="lilac">Required</Chip>}<Chip tone={st.tone}>{st.label}</Chip></p>
          <p className="text-xs text-ink-2">{c.why_listed}{c.stay_days ? ` · stay ${c.stay_days[0] >= 1 ? `${c.stay_days[0]}–${c.stay_days[1]} d` : `≤ ${c.stay_days[1]} d`}` : ''}</p>
        </div>
        {c.min_price != null && <div className="text-right"><p className="text-[11px] text-ink-2">From</p><p className="num display text-xl font-bold leading-none">{m(c.min_price)}</p></div>}
      </div>
      {c.research_only && <p className="flex items-start gap-1.5 text-sm text-bad"><ShieldAlert size={14} className="mt-0.5 shrink-0" aria-hidden />{c.research_only}</p>}
      {span ? <p className="text-sm">Useful departures <b>{span}</b> · {c.observed_count} with an observed fare · {gaps.length} search(es) would fill the ±{c.flex}-day window</p>
        : <p className="flex items-start gap-1.5 text-sm text-risk"><Lock size={14} className="mt-0.5 shrink-0" aria-hidden /><span>{reasons[0] ?? 'No departure date fits your rules from here.'}</span></p>}
      <div className="flex flex-wrap gap-2">
        {c.dates.length > 0 && <Button size="sm" onClick={() => setOpen((o) => !o)} aria-expanded={open}><CalendarSearch size={15} aria-hidden />Search flexible dates{open ? <ChevronUp size={14} aria-hidden /> : <ChevronDown size={14} aria-hidden />}</Button>}
        {c.state === 'observed' && onSeeFlights && <Button size="sm" variant="primary" onClick={() => onSeeFlights(c.city)}>See observed flights</Button>}
        {gaps.length > 0 && !viewOnly && <Button size="sm" disabled={busy} onClick={request}><Send size={15} aria-hidden />Request quotes</Button>}
      </div>
      {open && (
        <div className="flex max-w-full gap-2 overflow-x-auto pb-1" role="list" aria-label={`Useful departure dates to ${c.name}`}>
          {c.dates.map((d) => (
            <div role="listitem" key={d.date} className={`flex w-32 shrink-0 flex-col gap-0.5 rounded-xl border p-2.5 text-sm ${d.in_flex ? 'border-teal/60' : 'border-line'} ${d.preferred ? 'bg-teal-soft' : 'bg-surface'}`} data-status={d.status}>
              <b>{day(d.date)}</b>
              <span className={d.status === 'observed' ? 'num font-semibold' : 'text-xs text-ink-2'}>{d.status === 'observed' && d.min_price != null ? m(d.min_price) : DAY[d.status]}</span>
              {d.reasons?.[0] && <span className="text-[11px] text-risk">{d.reasons[0]}</span>}
              {d.observed_at && <span className="text-[11px] text-ink-2">{d.status === 'stale' ? 'Last quoted' : 'Observed'} {d.observed_at.slice(0, 10)}</span>}
              <a className="mt-auto inline-flex items-center gap-1 py-1 text-xs font-semibold text-teal underline" href={d.url} target="_blank" rel="noreferrer">Check live fare<ExternalLink size={11} aria-hidden /></a>
            </div>
          ))}
        </div>
      )}
      {open && reasons.length > 0 && <ul className="list-disc pl-5 text-xs text-ink-2">{reasons.map((r) => <li key={r}>{r}</li>)}</ul>}
      {msg && <p role="status" className="text-sm text-ink-2">{msg} {msg.startsWith('Saved in this browser') && <button className="inline-flex items-center gap-1 font-semibold text-teal underline" onClick={copy}><ClipboardCopy size={13} aria-hidden />Copy for collector</button>}</p>}
      <p className="text-[11px] text-ink-2">Planning candidate: not bookable until a fare is observed. Live-fare links open Google Flights; nothing is bought here.</p>
    </Card>
  );
}
