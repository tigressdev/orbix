import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { BookOpen, CalendarDays, ChevronRight, Footprints, GitBranchPlus, Landmark, Leaf, MapPin, MoonStar, Mountain, Plane, ShieldAlert, Sparkles, TrainFront, X } from 'lucide-react';
import { Button, Card, Chip } from '@/components/ui/primitives';
import { useChapters, useMetaOrThrow, useMoney, useParams } from '@/hooks/useStudioData';
import { fetchOptions } from '@/services/api/queries';
import { useStudio } from '@/stores/studio';
import { pathLegs, scenarioFromLegs } from '@/lib/tree';
import { EVENTS, EVENT_GUIDE, FESTIVAL_WINDOW } from './data/events';
import { SITES } from './data/sites';
import { chinaWindow, eventAccess, festivalSeasonPassed, fmt, type Window } from './engine/calendar';
import { getCulturalOpportunities, OPP_LABEL, packLanes, staysOf, type Opportunity, type Stay } from './engine/opportunities';
import { useSacredPrefs } from './useSacred';
import { Sources } from './ui';
import type { CulturalEvent } from './types';

const START = '2027-02-01', END = '2027-03-27', DAY_W = 30, ROW = 30;
const dayIx = (iso: string) => Math.round((Date.parse(iso + 'T00:00:00Z') - Date.parse(START + 'T00:00:00Z')) / 86_400_000);
const DAYS = dayIx(END) + 1;
const iso = (i: number) => new Date(Date.parse(START + 'T00:00:00Z') + i * 86_400_000).toISOString().slice(0, 10);
const addDays = (d: string, n: number) => iso(dayIx(d) + n);
const QUICK = ['2027-02-12', '2027-02-13', '2027-02-14', '2027-02-15', '2027-02-16'];
const IMPACT = { 'very-high': 'Very high travel demand', high: 'High travel demand', moderate: 'Moderate demand', low: 'Low demand', unknown: 'Demand unknown' } as const;
const KIND_ICON = { walk: Footprints, visit: Landmark, 'day-trip': TrainFront, overnight: MoonStar, practice: Leaf, festival: Sparkles, museum: BookOpen, site: Mountain, event: CalendarDays } as const;
type Region = 'all' | 'china' | 'tibetan';
const inRegion = (e: CulturalEvent, r: Region) => r === 'all' || (r === 'tibetan' ? (e.traditions as string[]).includes('tibetan-buddhism') : e.locations.some((l) => /^[A-Z_]+$/.test(l)));

function arrivalMessage(w: Window): { tone: 'gold' | 'teal' | 'risk'; lines: string[] } | null {
  if (!w.arrive) return null;
  const a = w.arrive;
  if (festivalSeasonPassed(w)) return { tone: 'risk', lines: ['You arrive after 20 February: the principal Lunar New Year festival period has passed.', 'Temples, museums and sacred landscapes remain; the seasonal displays will mostly be gone.'] };
  if (a > '2027-02-13') return { tone: 'teal', lines: ['The official holiday has ended, so transport and sights are easing.', `The broader New Year season continues to the Lantern Festival on 20 February (${dayIx('2027-02-20') - dayIx(a)} day(s) after you arrive).`] };
  if (a === '2027-02-13') return { tone: 'gold', lines: ['You arrive during the final day of the official holiday.', 'The broader New Year celebrations continue toward the Lantern Festival.'] };
  return { tone: 'gold', lines: [`You arrive during the official holiday, with ${dayIx('2027-02-13') - dayIx(a) + 1} day(s) of it left: the busiest days for transport and sights.`, 'The season then continues toward the Lantern Festival on 20 February.'] };
}

/** Cultural Windows: the intersection of a place, a date, an observance and the traveller's own itinerary. */
export default function CalendarMode({ onSite }: { onSite: (id: string, tab?: string) => void }) {
  const meta = useMetaOrThrow();
  const { sc } = useChapters();
  const [prefs] = useSacredPrefs();
  const legs = pathLegs(sc, sc.focusId);
  const branch = chinaWindow(legs, meta);
  const [whatIf, setWhatIf] = useState('');
  const [sel, setSel] = useState<string | null>('lantern-2027');
  const [region, setRegion] = useState<Region>('all');
  const [confirmedOnly, setConfirmedOnly] = useState(false);
  const w: Window = whatIf ? { arrive: whatIf, leave: branch.leave && branch.leave > whatIf ? branch.leave : null } : branch;
  const msg = arrivalMessage(w);

  // where the traveller is, day by day: the branch's stays, or an assumed first week in Beijing for a what-if date
  const stays: (Stay & { assumed?: boolean })[] = useMemo(() => {
    const real = staysOf(legs, meta).filter((s) => meta.cities[s.city]?.country === 'China');
    if (!whatIf && real.length) return real;
    const arrive = whatIf || '2027-02-13';
    const first = real[0];
    const depart = first && first.depart && first.depart > arrive ? first.depart : addDays(arrive, 7);
    return [{ city: 'BEIJING', arrive, depart, nights: dayIx(depart) - dayIx(arrive), assumed: !first || !!whatIf }, ...(whatIf ? [] : real.slice(1))];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sc, whatIf, meta]);

  const events = EVENTS.filter((e) => inRegion(e, region) && (!confirmedOnly || e.verifiedEventStatus === 'calendar-date'));
  const selected = events.find((e) => e.id === sel) ?? null;

  return (
    <section className="flex flex-col gap-5" aria-label="Cultural windows">
      <div className="flex flex-col gap-1">
        <p className="eyebrow flex items-center gap-1.5"><Sparkles size={14} aria-hidden />Year of the Fire Goat · 丁未</p>
        <h2 className="display text-3xl font-semibold leading-tight">Cultural windows</h2>
        <p className="max-w-2xl text-ink-2">Move your arrival and see which celebrations, places and experiences open or close. Nothing here changes your saved journey.</p>
      </div>

      <Card className="flex flex-col gap-3">
        <p className="text-[15px] font-semibold">What if I arrive in China on…</p>
        <div className="hscroll" role="group" aria-label="Arrival date">
          {QUICK.map((d) => (
            <button key={d} aria-pressed={(whatIf || branch.arrive) === d} onClick={() => setWhatIf(d)} data-testid={`quick-${d}`}
              className={clsx('flex min-h-14 min-w-16 shrink-0 flex-col items-center justify-center rounded-xl border px-3', (whatIf || branch.arrive) === d ? 'border-teal bg-teal text-white' : 'border-line bg-surface text-ink')}>
              <span className="text-[11px] font-semibold uppercase tracking-wider opacity-80">{new Date(d + 'T12:00Z').toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' })}</span>
              <span className="display text-xl font-semibold leading-none">{Number(d.slice(8))}</span><span className="text-[11px] opacity-80">Feb</span>
            </button>
          ))}
          <label className="flex min-h-14 shrink-0 flex-col justify-center rounded-xl border border-line bg-surface px-3 text-[11px] font-semibold uppercase tracking-wider text-ink-2">Custom
            <input type="date" min="2027-02-12" max="2027-03-20" value={whatIf || branch.arrive || ''} onChange={(e) => setWhatIf(e.target.value)} className="bg-transparent text-[15px] font-semibold normal-case tracking-normal text-ink" data-testid="whatif" /></label>
        </div>
        <p className="text-sm text-ink-2">
          {branch.arrive ? <>Your active branch reaches China on <b className="text-ink">{fmt(branch.arrive)}</b>.</> : 'Your active branch has no China arrival yet.'}{' '}
          {whatIf && <button className="min-h-9 font-semibold text-teal underline" onClick={() => setWhatIf('')}>Back to my branch</button>}
        </p>
        {msg && (
          <div role="status" data-testid="arrival-message" className={clsx('rounded-xl p-3 text-[15px]', msg.tone === 'risk' ? 'bg-risk-soft text-risk' : msg.tone === 'gold' ? 'bg-gold-soft text-ink' : 'bg-teal-soft text-ink')}>
            <p className="font-semibold">{msg.lines[0]}</p><p className="mt-0.5 text-sm">{msg.lines[1]}</p>
          </div>
        )}
        {whatIf && <ApplyWhatIf date={whatIf} />}
      </Card>

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter observances">
        {([['all', 'All'], ['china', 'China'], ['tibetan', 'Tibetan & Himalayan']] as [Region, string][]).map(([id, l]) => (
          <button key={id} aria-pressed={region === id} onClick={() => setRegion(id)} className={clsx('min-h-10 rounded-full border px-3.5 text-sm font-semibold', region === id ? 'border-ink bg-ink text-canvas' : 'border-line bg-surface text-ink-2')}>{l}</button>
        ))}
        <label className="flex min-h-10 items-center gap-2 text-sm text-ink-2"><input type="checkbox" className="size-5 accent-[var(--teal)]" checked={confirmedOnly} onChange={(e) => setConfirmedOnly(e.target.checked)} />Confirmed calendar dates only</label>
      </div>

      <Timeline w={w} stays={stays} events={events} sel={sel} onSel={setSel} onSite={onSite} whatIf={!!whatIf} />

      {selected && <EventDetail e={selected} w={w} onClose={() => setSel(null)} onSite={onSite} />}

      <div className="flex flex-col gap-3">
        <h3 className="display text-2xl font-semibold">Where you could be</h3>
        <p className="text-sm text-ink-2">Recommendations for each stay, ranked by the interests you set in Journey Alternatives. They are places and kinds of experience, not bookings.</p>
        {stays.map((s) => <StayCard key={s.city + s.arrive} stay={s} opps={getCulturalOpportunities(s.city, s.arrive, s.depart, prefs)} onSite={onSite} />)}
      </div>

      <Card className="flex items-start gap-3 text-sm"><ShieldAlert size={18} className="mt-0.5 shrink-0 text-risk" aria-hidden />
        <p className="text-ink-2"><b className="text-ink">High cultural significance, higher travel complexity.</b> Around the holiday expect heavier transport demand, uncertain accommodation, earlier reservations and changed opening hours. ORBIX applies no invented price multiplier: every fare on your branches is an observed quote.</p></Card>
    </section>
  );
}

function ApplyWhatIf({ date }: { date: string }) {
  const params = useParams();
  const m = useMoney();
  const viewOnly = useStudio((s) => s.viewOnly);
  const [done, setDone] = useState(false);
  const q = useQuery({ queryKey: ['options', params, []], queryFn: () => fetchOptions([], params), staleTime: 60_000 });
  const opt = q.data?.groups.find((g) => g.city === 'BEIJING')?.options.filter((o) => o.ok && o.arr_local.slice(0, 10) === date).sort((a, b) => a.price - b.price)[0];
  if (q.isLoading) return <p className="text-sm text-ink-2">Looking for observed flights landing in Beijing on {fmt(date)}…</p>;
  if (!opt) return <p className="text-sm text-ink-2" data-testid="apply-none"><Plane size={14} className="mr-1 inline" aria-hidden />No observed direct Madrid → Beijing flight lands on {fmt(date)}. Arrivals through a European stopover are built in Journey.</p>;
  if (done) return <p className="text-sm font-semibold text-teal" role="status">Saved as a new scenario. Your active journey is unchanged.</p>;
  const apply = () => { if (useStudio.getState().addScenario(scenarioFromLegs(`What-if · Beijing ${fmt(date)}`, [opt]), `Created a what-if scenario arriving in Beijing on ${fmt(date)}`)) setDone(true); };
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line p-3 text-sm">
      <span><Plane size={14} className="mr-1 inline text-teal" aria-hidden />Observed: {opt.airlines}, lands {opt.arr_local.slice(11)} · <b className="num">{m(opt.price)}</b></span>
      <Button size="sm" variant="primary" disabled={viewOnly} onClick={apply} data-testid="apply-whatif"><GitBranchPlus size={15} aria-hidden />Apply to new scenario</Button>
    </div>
  );
}

function Timeline({ w, stays, events, sel, onSel, onSite, whatIf }: { w: Window; stays: (Stay & { assumed?: boolean })[]; events: CulturalEvent[]; sel: string | null; onSel: (id: string) => void; onSite: (id: string) => void; whatIf: boolean }) {
  const meta = useMetaOrThrow();
  const x = (d: string) => dayIx(d) * DAY_W;
  const labelDays = (s: string) => Math.ceil((s.length * 7.2 + 14) / DAY_W);
  const culture = packLanes(events.map((e) => ({ e, start: dayIx(e.dateStart), end: dayIx(e.dateEnd) + labelDays(e.name) })), 0);
  const exp = packLanes(stays.flatMap((s) => SITES.filter((site) => site.nearbyTransportHubs.some((h) => h.city === s.city && !(h.relation === 'gateway' && h.mode === 'air')))
    .map((site) => { const a = dayIx(s.arrive) + 1, len = site.suggestedDuration?.minDays ?? 1; return { site, start: a, end: Math.max(a + len - 1, a) + labelDays(site.name), bar: len }; })), 0);
  const cLanes = Math.max(1, ...culture.map((c) => c.lane + 1)), eLanes = Math.max(1, ...exp.map((c) => c.lane + 1));
  const fixed = [
    ...(meta.bookings ?? []).map((b) => ({ d: (b.destination === 'MAD' ? b.arr_local : b.dep_local).slice(0, 10), label: b.destination === 'MAD' ? 'Land in Madrid' : 'Fly home', tone: 'ink' })),
    ...(meta.protected_dates ?? []).map((d) => ({ d, label: 'Birthday', tone: 'gold' })),
  ].filter((f) => f.d >= START && f.d <= END);
  const months = [{ label: 'February 2027', start: 0, len: 28 }, { label: 'March 2027', start: 28, len: DAYS - 28 }];
  const Lane = ({ title, rows, children }: { title: string; rows: number; children: React.ReactNode }) => (
    <div className="relative border-t border-line" style={{ height: rows * ROW + 26 }}>
      <span className="eyebrow sticky left-2 top-1 z-10 inline-block rounded bg-surface/90 px-1 !text-[10px]">{title}</span>
      <div className="absolute inset-x-0 bottom-1.5 top-6">{children}</div>
    </div>
  );
  return (
    <div className="rounded-2xl border border-line bg-surface" data-testid="timeline">
      <div className="overflow-x-auto overscroll-x-contain rounded-2xl" tabIndex={0} role="group" aria-label="Timeline, 1 February to 27 March 2027. Scroll sideways.">
        <div className="relative" style={{ width: DAYS * DAY_W }}>
          <div className="pointer-events-none absolute inset-y-0 bg-gold-soft/70" style={{ left: x(FESTIVAL_WINDOW.start), width: (dayIx(FESTIVAL_WINDOW.end) - dayIx(FESTIVAL_WINDOW.start) + 1) * DAY_W }} aria-hidden />
          {w.arrive && <div className="pointer-events-none absolute inset-y-0 z-10 w-0.5 bg-teal" style={{ left: x(w.arrive) + DAY_W / 2 }} aria-hidden />}
          <div className="relative flex h-6 text-xs font-semibold text-ink-2">{months.map((mo) => <div key={mo.label} className="sticky left-0 border-l border-line pl-2 pt-1" style={{ width: mo.len * DAY_W }}><span className="sticky left-2">{mo.label}</span></div>)}</div>
          <div className="relative flex h-7">
            {Array.from({ length: DAYS }, (_, i) => { const d = iso(i), wd = new Date(d + 'T12:00Z').getUTCDay(); return (
              <div key={d} className={clsx('grid shrink-0 place-items-center text-[12px] font-medium', (wd === 0 || wd === 6) ? 'text-ink' : 'text-ink-2', wd === 1 && 'border-l border-line', w.arrive === d && 'rounded-md bg-teal font-bold !text-white')} style={{ width: DAY_W }}>{Number(d.slice(8))}</div>
            ); })}
          </div>

          <Lane title="Travel" rows={1}>
            {stays.map((s) => { const len = Math.max(1, (s.depart ? dayIx(s.depart) : Math.min(DAYS - 1, dayIx(s.arrive) + 5)) - dayIx(s.arrive)); return (
              <div key={s.city + s.arrive} className={clsx('absolute flex h-6 items-center overflow-hidden rounded-md px-2 text-[12px] font-semibold text-ink', s.assumed ? 'border border-dashed border-teal bg-surface' : 'bg-teal-soft')}
                style={{ left: x(s.arrive) + DAY_W / 2, width: len * DAY_W }} title={`${meta.cities[s.city]?.name}: ${fmt(s.arrive)}${s.depart ? ` to ${fmt(s.depart)}` : ''}${s.assumed ? ' (assumed)' : ''}`}>
                <span className="truncate">{meta.cities[s.city]?.name ?? s.city}{s.assumed ? ' · assumed' : ''}</span>
              </div>
            ); })}
            {fixed.map((f) => (
              <div key={f.label + f.d} className="absolute flex h-6 items-center gap-1 whitespace-nowrap text-[12px] font-semibold text-ink" style={{ left: x(f.d) + 4 }}>
                <span className={clsx('size-2.5 rounded-full', f.tone === 'gold' ? 'bg-gold' : 'bg-ink')} />{f.label}
              </div>
            ))}
          </Lane>

          <Lane title="Culture" rows={cLanes}>
            {culture.map(({ e, lane }) => { const barW = Math.max(1, dayIx(e.dateEnd) - dayIx(e.dateStart) + 1) * DAY_W; return (
              <button key={e.id} onClick={() => onSel(e.id)} aria-pressed={sel === e.id} data-testid={`bar-${e.id}`} aria-label={`${e.name}, ${fmt(e.dateStart)}${e.dateEnd !== e.dateStart ? ` to ${fmt(e.dateEnd)}` : ''}`}
                className="absolute flex h-6 items-center gap-1.5 whitespace-nowrap text-left" style={{ left: x(e.dateStart), top: lane * ROW }}>
                <span className={clsx('h-4 shrink-0 rounded-full', sel === e.id ? 'bg-teal ring-2 ring-teal/30' : e.verifiedEventStatus === 'calendar-date' ? 'bg-ink' : 'border-2 border-dashed border-ink bg-transparent')} style={{ width: barW - 4, marginLeft: 2 }} />
                <span className={clsx('text-[13px] font-semibold', sel === e.id ? 'text-teal' : 'text-ink')}>{e.name}</span>
              </button>
            ); })}
          </Lane>

          <Lane title={whatIf ? 'Experiences · for this what-if' : 'Experiences'} rows={eLanes}>
            {exp.length === 0 && <span className="sticky left-2 text-xs text-ink-2">Add a China stay to see visit windows.</span>}
            {exp.map(({ site, start, lane, bar }) => (
              <button key={site.id + start} onClick={() => onSite(site.id)} className="absolute flex h-6 items-center gap-1.5 whitespace-nowrap" style={{ left: start * DAY_W, top: lane * ROW }} aria-label={`${site.name}: suggested ${bar} day visit`}>
                <span className="h-4 shrink-0 rounded-full bg-sage" style={{ width: bar * DAY_W - 4, marginLeft: 2 }} /><span className="text-[13px] font-semibold text-ink underline decoration-line underline-offset-2">{site.name}</span>
              </button>
            ))}
          </Lane>
        </div>
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 border-t border-line px-3 py-2 text-xs text-ink-2">
        <li><span className="mr-1 inline-block h-2.5 w-4 rounded-sm bg-gold-soft align-middle" />6–20 Feb festival season</li>
        <li><span className="mr-1 inline-block h-3 w-0.5 bg-teal align-middle" />China arrival</li>
        <li><span className="mr-1 inline-block h-2.5 w-4 rounded-full bg-ink align-middle" />Calendar date</li>
        <li><span className="mr-1 inline-block h-2.5 w-4 rounded-full border-2 border-dashed border-ink align-middle" />Tentative date</li>
        <li><span className="mr-1 inline-block h-2.5 w-4 rounded-full bg-sage align-middle" />Suggested visit window</li>
      </ul>
    </div>
  );
}

function EventDetail({ e, w, onClose, onSite }: { e: CulturalEvent; w: Window; onClose: () => void; onSite: (id: string, tab?: string) => void }) {
  const meta = useMetaOrThrow();
  const a = eventAccess(e, w);
  const g = EVENT_GUIDE[e.id];
  const nearby = SITES.filter((s) => e.locations.includes(s.id) || s.nearbyTransportHubs.some((h) => h.city && h.relation !== 'gateway' && e.locations.includes(h.city)));
  const where = e.locations.map((l) => meta.cities[l]?.name ?? SITES.find((s) => s.id === l)?.name ?? l).join(' · ');
  const Row = ({ icon: I, title, children }: { icon: typeof MapPin; title: string; children: React.ReactNode }) => (
    <div className="flex gap-3"><I size={18} className="mt-0.5 shrink-0 text-teal" aria-hidden /><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wider text-ink-2">{title}</p><div className="text-[15px] leading-relaxed">{children}</div></div></div>
  );
  return (
    <Card className="flex flex-col gap-4 border-teal/40" data-testid={`event-${e.id}`} data-access={a.access}>
      <div className="flex items-start justify-between gap-2">
        <div><p className="display text-2xl font-semibold leading-tight">{e.name}</p><p className="text-sm text-ink-2">{e.localName}{e.romanization ? ` · ${e.romanization}` : ''}</p>
          <p className="num mt-1 text-sm font-semibold">{fmt(e.dateStart)}{e.dateEnd !== e.dateStart ? ` – ${fmt(e.dateEnd)}` : ''} 2027</p></div>
        <button className="grid size-11 shrink-0 place-items-center rounded-full text-ink-2 hover:bg-line/60" aria-label="Close" onClick={onClose}><X size={18} /></button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Chip tone={a.access === 'within-stay' ? 'teal' : a.access === 'final-days' ? 'gold' : a.access === 'passed' ? 'neutral' : 'lilac'}>{a.label}</Chip>
        <Chip>{e.officialHolidayStatus === 'public-holiday-period' ? 'Official public holiday' : e.officialHolidayStatus === 'regional' ? 'Regional observance' : 'Not a public holiday'}</Chip>
        <Chip tone={e.verifiedEventStatus === 'calendar-date' ? 'teal' : 'risk'}>{e.verifiedEventStatus === 'calendar-date' ? 'Calendar date' : 'Date tentative'}</Chip>
        <Chip tone={e.expectedTravelImpact.level === 'very-high' ? 'risk' : 'neutral'}>{IMPACT[e.expectedTravelImpact.level]}</Chip>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Row icon={Sparkles} title="What it celebrates">{e.englishName}. {e.significance}</Row>
        <Row icon={BookOpen} title="Calendar and history">{e.calendarSystem}.{e.distinctFrom && <> Distinct from {e.distinctFrom.map((id) => EVENTS.find((x) => x.id === id)?.name).join(', ')}: a different calendar and tradition.</>}</Row>
        <Row icon={MapPin} title="Where it is observed">{where}</Row>
        <Row icon={Footprints} title="What visitors might experience">{g?.visitors}</Row>
        <Row icon={CalendarDays} title="Your journey">{a.note}</Row>
        <Row icon={ShieldAlert} title="Still unverified">{g?.unverified} Possible cultural experience — local schedule not confirmed.</Row>
      </div>
      {nearby.length > 0 && (
        <div><p className="text-xs font-semibold uppercase tracking-wider text-ink-2">Places connected with it</p>
          <div className="mt-1.5 flex flex-wrap gap-2">{nearby.map((s) => (
            <span key={s.id} className="inline-flex overflow-hidden rounded-full border border-line text-sm font-semibold">
              <button className="min-h-10 px-3 text-teal" onClick={() => onSite(s.id)}>{s.name}</button>
              <button className="min-h-10 border-l border-line px-3 text-ink-2" onClick={() => onSite(s.id, 'impact')} aria-label={`Impact of adding ${s.name}`}>Impact</button>
            </span>
          ))}</div></div>
      )}
      {e.expectedTravelImpact.notes.length > 0 && <ul className="list-disc pl-5 text-sm text-ink-2">{e.expectedTravelImpact.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
      <Sources items={e.sources} /><p className="text-[11px] text-ink-2">Last verified {e.lastVerified}.</p>
    </Card>
  );
}

const CLS_TONE = { 'during-stay': 'teal', 'day-trip': 'teal', 'extra-overnight': 'gold', 'requires-date-change': 'gold', 'outside-window': 'neutral', 'access-restricted': 'lilac', 'requires-verification': 'risk' } as const;

function StayCard({ stay, opps, onSite }: { stay: Stay & { assumed?: boolean }; opps: Opportunity[]; onSite: (id: string, tab?: string) => void }) {
  const meta = useMetaOrThrow();
  const [all, setAll] = useState(false);
  const shown = all ? opps : opps.filter((o) => o.cls !== 'outside-window').slice(0, 6);
  return (
    <Card className="flex flex-col gap-3" data-testid={`stay-${stay.city}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="display text-xl font-semibold">{meta.cities[stay.city]?.name ?? stay.city}</p>
        <p className="num text-sm text-ink-2">{fmt(stay.arrive)}{stay.depart ? ` → ${fmt(stay.depart)} · ${stay.nights} night(s)` : ' → open'}{stay.assumed ? ' · assumed stay' : ''}</p>
      </div>
      {opps.length === 0 && <p className="text-sm text-ink-2">No catalogued place or observance is attached to this city yet.</p>}
      <ul className="grid gap-2 md:grid-cols-2">
        {shown.map((o) => { const I = KIND_ICON[o.kind]; const body = (
          <div className="flex h-full items-start gap-3 rounded-xl border border-line p-3 text-left">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-2 text-teal"><I size={18} aria-hidden /></span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5"><b className="text-[15px]">{o.title}</b><Chip tone={CLS_TONE[o.cls]}>{OPP_LABEL[o.cls]}</Chip></span>
              <span className="block text-sm text-ink-2">{o.text}</span>
              <span className="mt-0.5 block text-xs text-ink-2">{o.duration ? `${o.duration} · ` : ''}{o.note}</span>
            </span>
            {o.siteId && <ChevronRight size={16} className="mt-1 shrink-0 text-ink-2" aria-hidden />}
          </div>
        ); return <li key={o.id}>{o.siteId ? <button className="block size-full" onClick={() => onSite(o.siteId!)}>{body}</button> : body}</li>; })}
      </ul>
      {opps.length > shown.length && <button className="min-h-10 self-start text-sm font-semibold text-teal underline" onClick={() => setAll(true)}>Show all {opps.length}</button>}
    </Card>
  );
}
