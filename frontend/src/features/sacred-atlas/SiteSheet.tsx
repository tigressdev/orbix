import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Check, GitBranchPlus, GitCompareArrows, Loader2, Mountain, Route } from 'lucide-react';
import { Sheet } from '@/components/ui/Sheet';
import { Button, Card, Chip, ErrorNote } from '@/components/ui/primitives';
import { useChapters, useMetaOrThrow, useMoney } from '@/hooks/useStudioData';
import { useStudio } from '@/stores/studio';
import { pathLegs } from '@/lib/tree';
import { siteById } from './data/sites';
import { EVENTS } from './data/events';
import { TRADITION_LABEL } from './data/traditions';
import { chinaWindow, eventAccess, fmt } from './engine/calendar';
import { siteFeasibility } from './engine/feasibility';
import { coverage } from './engine/preferences';
import type { AltPlan } from './engine/alternatives';
import { useAddAlternative, useSacredPlan, useSacredPrefs } from './useSacred';
import { CertTag, FeasBadge, Section, Segmented, Sources } from './ui';
import type { Summary } from '@/types';

type Tab = 'about' | 'calendar' | 'impact';

export function SiteSheet({ siteId, onClose, initialTab = 'about' }: { siteId: string | null; onClose: () => void; initialTab?: Tab }) {
  const site = siteId ? siteById(siteId) : undefined;
  const [tab, setTab] = useState<Tab>(initialTab);
  useEffect(() => { setTab(initialTab); }, [siteId, initialTab]);
  if (!site) return null;
  const f = siteFeasibility(site);
  return (
    <Sheet open={!!site} onOpenChange={(o) => { if (!o) onClose(); }} title={site.name}
      description={`${site.country} · ${site.region}${site.originalName ? ` · ${site.originalName}` : ''}`}>
      <div className="flex flex-col gap-4" data-testid="site-sheet">
        <div className="flex flex-wrap items-center gap-1.5">
          <FeasBadge s={f.status} />
          {site.traditions.map((t) => <Chip key={t}>{TRADITION_LABEL[t]}</Chip>)}
          {site.suggestedDuration && <Chip tone="teal">{site.suggestedDuration.minDays}–{site.suggestedDuration.maxDays} days</Chip>}
          {site.altitudeM && <Chip tone="risk"><Mountain size={12} aria-hidden />{site.altitudeM.toLocaleString('en')} m</Chip>}
        </div>
        <p className="display text-xl leading-snug">{site.significance}</p>
        <Segmented label="Place sections" value={tab} onChange={setTab} options={[{ id: 'about', label: 'Why it matters' }, { id: 'calendar', label: 'Calendar' }, { id: 'impact', label: 'Journey impact' }]} />
        {tab === 'about' && <About id={site.id} />}
        {tab === 'calendar' && <SiteCalendar id={site.id} />}
        {tab === 'impact' && <Impact id={site.id} onDone={onClose} />}
      </div>
    </Sheet>
  );
}

function About({ id }: { id: string }) {
  const s = siteById(id)!;
  const f = siteFeasibility(s);
  return (
    <div className="flex flex-col gap-5">
      <Card className="flex flex-col gap-1 bg-surface-2 text-sm">
        <p className="font-semibold">Access status</p>
        <ul className="list-disc pl-5 text-ink-2">{f.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
        {s.advisory && (
          <div className="mt-2 border-t border-line pt-2">
            <p className="font-semibold">Government travel advice</p>
            <p className="text-ink-2">{s.advisory.lastVerified ? `Verified ${s.advisory.lastVerified}: ${s.advisory.summary}` : 'Not yet retrieved or dated in ORBIX. Read the current advice before treating this as more than research.'}</p>
            <Sources title="Official advice" items={s.advisory.links} />
          </div>
        )}
      </Card>
      <h2 className="display text-2xl font-semibold">Why this place matters</h2>
      <Section title="Historical origins">{s.why.origins}</Section>
      <Section title="Associated traditions">{s.why.traditions}</Section>
      <Section title="Major ideas">{s.why.ideas}</Section>
      <Section title="Architecture and landscapes">{s.why.architecture}</Section>
      <Section title="Living religious practices">{s.why.practice}</Section>
      <Section title="Cultural significance">{s.why.significance}</Section>
      <Section title="Places">
        <ul className="flex flex-col gap-1.5">{s.places.map((p) => <li key={p.name}><b>{p.name}</b>{p.originalName && <span className="text-ink-2"> · {p.originalName}</span>}{p.note && <span className="block text-sm text-ink-2">{p.note}</span>}</li>)}</ul>
      </Section>
      <Section title="Practical visit considerations">
        <p>{s.why.practical}</p>
        <ul className="mt-1 flex flex-col gap-1 text-sm">{s.visitRequirements.map((r) => <li key={r.text}>{r.text}<CertTag c={r.certainty} /></li>)}</ul>
      </Section>
      <Section title="Questions to explore">
        <ul className="flex flex-col gap-2">{s.questions.map((q) => <li key={q} className="border-l-2 border-gold pl-3 italic">{q}</li>)}</ul>
      </Section>
      <Sources title="Further reading" items={s.why.reading} />
      <Sources items={s.sources} />
      <p className="text-xs text-ink-2">Historical period: {s.historicalPeriod}.</p>
    </div>
  );
}

function SiteCalendar({ id }: { id: string }) {
  const meta = useMetaOrThrow();
  const { sc } = useChapters();
  const s = siteById(id)!;
  const w = chinaWindow(pathLegs(sc, sc.focusId), meta);
  const rel = EVENTS.filter((e) => e.locations.includes(s.id) || s.nearbyTransportHubs.some((h) => h.city && h.relation !== 'gateway' && e.locations.includes(h.city)));
  const inPath = [s.id];
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-ink-2">{w.arrive ? `This branch reaches China on ${fmt(w.arrive)}${w.leave ? ` and leaves on ${fmt(w.leave)}` : ''}.` : 'This branch has no China arrival yet.'} Overlap is not access: local events, tickets and opening hours need separate verification.</p>
      {rel.length === 0 && <p className="text-sm">No catalogued observance is tied to this place in the travel window.</p>}
      {rel.map((e) => { const a = eventAccess(e, w, inPath); return (
        <Card key={e.id} className="flex flex-col gap-1">
          <div className="flex items-start justify-between gap-2"><p className="display text-lg font-semibold">{e.name}</p><Chip tone={a.access === 'within-stay' ? 'teal' : a.access === 'final-days' ? 'gold' : 'neutral'}>{a.label}</Chip></div>
          <p className="text-sm text-ink-2">{e.localName} · {fmt(e.dateStart)}{e.dateEnd !== e.dateStart ? `–${fmt(e.dateEnd)}` : ''} · {e.calendarSystem}</p>
          <p className="text-sm">{a.note}</p>
        </Card>
      ); })}
    </div>
  );
}

const nightsBy = (s: Summary | null, country: string, cities: Record<string, { country: string }>) => s ? Object.entries(s.nights).filter(([c]) => cities[c]?.country === country).reduce((a, [, n]) => a + n, 0) : 0;

function Impact({ id, onDone }: { id: string; onDone: () => void }) {
  const [run, setRun] = useState(false);
  const q = useSacredPlan(id, run);
  const s = siteById(id)!;
  const [prefs] = useSacredPrefs();
  const cov = coverage(s, prefs);
  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-2">
        <p className="eyebrow">Two separate dimensions</p>
        <Bar label="Cultural / experiential coverage" note="from your weights and editorial descriptors, not a measure of significance" value={cov.score} tone="teal" />
        <p className="text-xs text-ink-2">Financial and temporal cost comes from the route engine below.</p>
      </Card>
      {!run && <Button variant="primary" size="lg" onClick={() => setRun(true)} data-testid="evaluate"><Route size={18} aria-hidden />Compare journey impact</Button>}
      {q.isFetching && <p className="flex items-center gap-2 text-sm text-ink-2" aria-live="polite"><Loader2 size={16} className="animate-spin" aria-hidden />Checking observed transport and evaluating both paths…</p>}
      {q.error && <ErrorNote error={q.error} onRetry={() => q.refetch()} />}
      {q.data && <ImpactResult plan={q.data} onDone={onDone} />}
    </div>
  );
}

export function Bar({ label, note, value, tone }: { label: string; note?: string; value: number; tone: 'teal' | 'gold' }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-sm"><span className="font-semibold">{label}</span><span className="num font-semibold">{value}%</span></div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-line" role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} aria-label={label}><div className={tone === 'teal' ? 'h-full bg-teal' : 'h-full bg-gold'} style={{ width: `${value}%` }} /></div>
      {note && <p className="mt-0.5 text-xs text-ink-2">{note}</p>}
    </div>
  );
}

export function ImpactResult({ plan, onDone }: { plan: AltPlan; onDone?: () => void }) {
  const meta = useMetaOrThrow();
  const m = useMoney();
  const nav = useNavigate();
  const { sc } = useChapters();
  const viewOnly = useStudio((s) => s.viewOnly);
  const add = useAddAlternative();
  const [created, setCreated] = useState<string | null>(null);
  const city = (ap: string) => meta.cities[meta.airports[ap] ?? '']?.name ?? ap;
  const chain = (legs: { destination: string }[]) => ['Madrid', ...legs.map((l) => city(l.destination))].join(' → ');
  const baseLegs = pathLegs(sc, sc.focusId);
  const d = plan.delta;
  const signed = (v: number) => (v > 0 ? `+${m(v)}` : v < 0 ? `−${m(-v)}` : m(0));
  const newLegs = plan.legs.filter((l) => !baseLegs.some((b) => b.key === l.key));
  const fresh = newLegs.map((l) => l.observed_at).filter(Boolean).sort()[0];
  const NA = 'Not priced — requires verification';
  const rows: [string, string, string?][] = [
    ['Additional airfare', d ? signed(d.flights) : '—', 'observed fares'],
    ['Accommodation', d ? signed(d.hotel) : '—', 'estimate per night'],
    ['Baggage and transfers', d ? signed(d.bags + d.transfers) : '—', 'estimate'],
    ['Ground transportation', NA], ['Entrance fees', NA], ['Guided tours', NA],
    ['Permits and agency', plan.site.accessibilityStatus === 'permit_dependent' ? NA : 'None expected'],
  ];
  const ru = [nightsBy(plan.base, 'Russia', meta.cities), nightsBy(plan.alt, 'Russia', meta.cities)];
  const cn = [nightsBy(plan.base, 'China', meta.cities), nightsBy(plan.alt, 'China', meta.cities)];
  const displaced = Object.entries(plan.nightsDelta).filter(([, v]) => v < 0);

  const onAdd = () => { const id = add(plan); if (id) setCreated(id); };
  const openIt = () => { if (created) { useStudio.getState().switchScenario(created); onDone?.(); nav('/'); } };
  const compare = () => {
    if (!created) return;
    const st = useStudio.getState();
    const alt = st.scenarios.find((x) => x.id === created);
    if (!st.compare.some((p) => p.sid === sc.id && p.nid === sc.focusId)) st.togglePin(sc.id, sc.focusId);
    if (alt) st.togglePin(alt.id, alt.focusId);
    onDone?.(); nav('/more/scenarios');
  };

  return (
    <div className="flex flex-col gap-4" data-testid="impact">
      <Card className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2"><p className="eyebrow">Feasibility</p><FeasBadge s={plan.feasibility} /></div>
        <p className={`text-sm font-semibold ${plan.recommend.ok ? 'text-good' : 'text-risk'}`} data-testid="recommend">
          {plan.recommend.ok ? 'Can be recommended as a feasible complete route.' : 'Not recommendable as a feasible complete route yet.'}
        </p>
        {!plan.recommend.ok && <ul className="list-disc pl-5 text-sm text-ink-2">{plan.recommend.reasons.map((r) => <li key={r}>{r}</li>)}</ul>}
        {plan.notes.map((n) => <p key={n} className="text-sm">{n}</p>)}
      </Card>

      <Card className="flex flex-col gap-2 text-sm">
        <p className="eyebrow">Current plan</p><p className="font-medium">{chain(baseLegs)}</p>
        <p className="eyebrow mt-1">Alternative</p><p className="font-medium">{chain(plan.legs)}{plan.kind === 'chapter' && ` · ${plan.site.name} as a chapter of ${plan.hub?.name}`}</p>
        <ul className="mt-1 flex flex-col gap-1">
          {plan.segments.map((sg, i) => (
            <li key={i} className="flex flex-wrap items-center gap-1.5"><span>{sg.from}</span><ArrowRight size={13} aria-hidden /><span>{sg.to}</span>
              <Chip tone={sg.status === 'observed' || sg.status === 'kept' ? 'teal' : sg.status === 'unavailable' ? 'bad' : 'risk'}>{sg.status === 'observed' ? 'Observed flight' : sg.status === 'kept' ? 'Kept' : sg.status === 'unavailable' ? 'Transport data unavailable — requires verification' : 'Ground transport unverified'}</Chip></li>
          ))}
        </ul>
      </Card>

      <Card className="!py-1 divide-y divide-line">
        <p className="eyebrow py-2">Sacred journey economics · versus active branch</p>
        {rows.map(([k, v, n]) => <div key={k} className="flex items-baseline justify-between gap-3 py-2"><div><p className="text-[15px]">{k}</p>{n && <p className="text-xs text-ink-2">{n}</p>}</div><p className={`num shrink-0 text-right text-sm font-semibold ${v === NA ? 'max-w-[9rem] text-risk' : ''}`}>{v}</p></div>)}
        <div className="flex items-baseline justify-between gap-3 py-2"><p className="font-semibold">Priced difference</p><p className="num text-lg font-bold" data-testid="delta-total">{d ? signed(d.total) : '—'}</p></div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 py-2 text-sm">
          <span className="text-ink-2">Incremental travel days</span><span className="num text-right">{plan.extraDays}</span>
          <span className="text-ink-2">Nights in China</span><span className="num text-right">{cn[0]} → {cn[1]}</span>
          <span className="text-ink-2">Nights in Russia</span><span className="num text-right">{ru[0]} → {ru[1]}</span>
          <span className="text-ink-2">Displaced nights</span><span className="text-right">{displaced.length ? displaced.map(([c, v]) => `${meta.cities[c]?.name ?? c} ${v}`).join(', ') : 'none'}</span>
          <span className="text-ink-2">Return to Madrid</span><span className={`text-right ${plan.ret.ok ? '' : 'font-semibold text-bad'}`}>{plan.ret.arriveMadrid ?? 'not reached'}</span>
          <span className="text-ink-2">Data freshness</span><span className="text-right">{fresh ? `observed ${fresh.slice(0, 10)}` : newLegs.length ? 'unknown' : 'no new legs'}</span>
        </div>
        <p className="py-2 text-xs text-ink-2">Both totals are whole-path server evaluations, so shared flights are counted once. Unpriced items are listed, never guessed.</p>
      </Card>

      {plan.unresolved.length > 0 && (
        <Card className="bg-risk-soft/60 text-sm"><p className="font-semibold text-risk">Unresolved before booking</p><ul className="mt-1 list-disc pl-5">{plan.unresolved.map((u) => <li key={u}>{u}</li>)}</ul></Card>
      )}

      {!created ? (
        <Button variant="primary" size="lg" disabled={viewOnly} onClick={onAdd} data-testid="add-alternative"><GitBranchPlus size={18} aria-hidden />Add to Journey Alternatives</Button>
      ) : (
        <Card className="flex flex-col gap-2 border-teal/40" role="status">
          <p className="flex items-center gap-2 font-semibold text-teal"><Check size={18} aria-hidden />Saved as a new scenario, “Sacred · {plan.site.name}”.</p>
          <p className="text-sm text-ink-2">Your current journey “{sc.name}” is unchanged and still active.</p>
          <div className="flex flex-wrap gap-2"><Button onClick={compare}><GitCompareArrows size={16} aria-hidden />Compare with original</Button><Button variant="ghost" onClick={openIt}>Open alternative in Journey</Button></div>
        </Card>
      )}
      {viewOnly && <p className="text-xs text-ink-2">View only: alternatives cannot be saved to someone else’s plans.</p>}
    </div>
  );
}
