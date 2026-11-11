import { useState } from 'react';
import { Card, Chip } from '@/components/ui/primitives';
import { useChapters, useMetaOrThrow } from '@/hooks/useStudioData';
import { pathLegs } from '@/lib/tree';
import { EVENTS, FESTIVAL_WINDOW } from './data/events';
import { chinaWindow, eventAccess, festivalSeasonPassed, fmt, type Window } from './engine/calendar';
import { Sources } from './ui';

const START = '2027-02-01', END = '2027-03-27';
const day = (iso: string) => Math.round((Date.parse(iso + 'T00:00:00Z') - Date.parse(START + 'T00:00:00Z')) / 86_400_000);
const SPAN = day(END);
const pct = (iso: string) => `${(day(iso) / SPAN) * 100}%`;
const IMPACT = { 'very-high': 'Very high travel demand', high: 'High travel demand', moderate: 'Moderate', low: 'Low', unknown: 'Impact unknown' } as const;

/** Cultural timeline synchronised with the active branch. A "what if I arrive on…" date lets the traveller test other arrivals. */
export default function CalendarMode() {
  const meta = useMetaOrThrow();
  const { sc } = useChapters();
  const branch = chinaWindow(pathLegs(sc, sc.focusId), meta);
  const [whatIf, setWhatIf] = useState<string>('');
  const w: Window = whatIf ? { arrive: whatIf, leave: branch.leave } : branch;
  const fixed = meta.bookings ?? [];
  const markers = [
    ...fixed.map((b) => ({ d: (b.destination === 'MAD' ? b.arr_local : b.dep_local).slice(0, 10), label: b.destination === 'MAD' ? 'Land in Madrid' : 'Flight home', kind: 'fixed' })),
    ...(meta.protected_dates ?? []).map((d) => ({ d, label: 'Birthday · no flights', kind: 'personal' })),
    ...(w.arrive ? [{ d: w.arrive, label: whatIf ? 'What-if arrival' : 'China arrival (branch)', kind: 'arrive' }] : []),
    ...(w.leave ? [{ d: w.leave, label: 'Leave China', kind: 'leave' }] : []),
  ];
  return (
    <section className="flex flex-col gap-4" aria-label="Cultural calendar">
      <div><h2 className="display text-3xl font-semibold">The Fire Goat arrives first</h2>
        <p className="max-w-2xl text-ink-2">Your window opens just after the Lunar New Year. The official holiday and the festive season are not the same thing: the season runs to the Lantern Festival.</p></div>

      <Card className="flex flex-col gap-3">
        <label className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-semibold">What if I reach China on</span>
          <input type="date" min="2027-02-12" max="2027-03-20" value={whatIf || branch.arrive || ''} onChange={(e) => setWhatIf(e.target.value)} className="min-h-11 rounded-xl border border-line bg-surface px-3" data-testid="whatif" />
          {whatIf && <button className="min-h-11 px-2 text-teal underline" onClick={() => setWhatIf('')}>Use my branch</button>}
        </label>
        <p className="text-sm text-ink-2">{branch.arrive ? `Your active branch reaches China on ${fmt(branch.arrive)}.` : 'Your active branch has no China arrival yet.'}</p>
        {festivalSeasonPassed(w) && <p className="rounded-xl bg-risk-soft p-3 text-sm font-medium text-risk" role="status">You arrive after 20 February: the principal Lunar New Year festival period has passed.</p>}

        <div className="relative mt-2 h-44 overflow-hidden rounded-xl border border-line bg-surface-2" role="img" aria-label="Timeline from 1 February to 27 March 2027">
          <div className="absolute inset-y-0 bg-gold-soft" style={{ left: pct(FESTIVAL_WINDOW.start), width: `calc(${pct(FESTIVAL_WINDOW.end)} - ${pct(FESTIVAL_WINDOW.start)})` }} />
          {w.arrive && <div className="absolute inset-y-0 bg-teal/10" style={{ left: pct(w.arrive), width: `calc(${pct(w.leave ?? END)} - ${pct(w.arrive)})` }} />}
          {EVENTS.map((e, i) => (
            <div key={e.id} className="absolute h-5 rounded-md bg-ink/80 px-1 text-[10px] font-semibold leading-5 text-canvas whitespace-nowrap" style={{ top: 8 + i * 22, left: pct(e.dateStart), minWidth: 6, width: `calc(${pct(e.dateEnd)} - ${pct(e.dateStart)} + ${100 / SPAN}%)` }} title={e.name}>
              <span className="pl-1">{e.name}</span>
            </div>
          ))}
          {markers.map((mk) => (
            <div key={mk.label + mk.d} className="absolute bottom-0 top-[118px] w-px" style={{ left: pct(mk.d), background: mk.kind === 'arrive' ? 'var(--teal)' : mk.kind === 'personal' ? 'var(--gold)' : 'var(--ink-2)' }}>
              <span className="absolute bottom-1 left-1 whitespace-nowrap text-[10px] font-semibold">{fmt(mk.d)}</span>
            </div>
          ))}
          <div className="absolute bottom-0 inset-x-0 flex justify-between px-1 text-[10px] text-ink-2"><span /><span /></div>
        </div>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
          {markers.map((mk) => <li key={mk.label + mk.d}>{fmt(mk.d)} · {mk.label}</li>)}
          <li><span className="mr-1 inline-block size-2.5 bg-gold-soft align-middle" />6–20 Feb festival focus</li>
        </ul>
      </Card>

      <div className="grid gap-3 md:grid-cols-2" data-testid="event-cards">
        {EVENTS.map((e) => {
          const a = eventAccess(e, w);
          return (
            <Card key={e.id} className="flex flex-col gap-1.5" data-testid={`event-${e.id}`} data-access={a.access}>
              <div className="flex items-start justify-between gap-2">
                <div><p className="display text-xl font-semibold leading-tight">{e.name}</p><p className="text-sm text-ink-2">{e.localName}{e.romanization ? ` · ${e.romanization}` : ''}</p></div>
                <Chip tone={a.access === 'within-stay' ? 'teal' : a.access === 'final-days' ? 'gold' : a.access === 'passed' ? 'neutral' : 'lilac'}>{a.label}</Chip>
              </div>
              <p className="num text-sm font-semibold">{fmt(e.dateStart)}{e.dateEnd !== e.dateStart ? ` – ${fmt(e.dateEnd)}` : ''} 2027 · <span className="font-normal text-ink-2">{e.calendarSystem}</span></p>
              <p className="text-sm">{e.englishName}. {e.significance}</p>
              <p className="text-sm text-ink-2">{a.note}</p>
              <div className="flex flex-wrap gap-1.5">
                <Chip>{e.officialHolidayStatus === 'public-holiday-period' ? 'Official public holiday' : e.officialHolidayStatus === 'regional' ? 'Regional observance' : 'Not a public holiday'}</Chip>
                <Chip tone={e.verifiedEventStatus === 'calendar-date' ? 'teal' : 'risk'}>{e.verifiedEventStatus === 'calendar-date' ? 'Calendar date' : 'Date tentative'}</Chip>
                <Chip tone={e.expectedTravelImpact.level === 'very-high' ? 'risk' : 'neutral'}>{IMPACT[e.expectedTravelImpact.level]}</Chip>
              </div>
              {e.distinctFrom && <p className="text-xs text-ink-2">Distinct from {e.distinctFrom.map((id) => EVENTS.find((x) => x.id === id)?.name).join(', ')}: same season or date, different calendar and tradition.</p>}
              {e.expectedTravelImpact.notes.length > 0 && <ul className="list-disc pl-5 text-xs text-ink-2">{e.expectedTravelImpact.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
              <Sources items={e.sources} />
              <p className="text-[11px] text-ink-2">Last verified {e.lastVerified}. Local ceremonies and schedules not confirmed.</p>
            </Card>
          );
        })}
      </div>

      <Card className="text-sm">
        <p className="font-semibold">Economic trade-off</p>
        <p className="mt-1 text-ink-2">High cultural significance against higher travel complexity: heavier transport demand, uncertain accommodation, earlier reservations, and possible changes to attraction hours. ORBIX applies no invented price multiplier: fares on your branches are observed quotes; anything else is labelled as an estimate.</p>
      </Card>
    </section>
  );
}
