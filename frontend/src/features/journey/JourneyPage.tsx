import { lazy, Suspense, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { Check, ChevronDown, Gift, Plane, Plus, Trash2, Undo2, Users } from 'lucide-react';
import { Button, Card, Chip, Skeleton } from '@/components/ui/primitives';
import { Sheet } from '@/components/ui/Sheet';
import { ExplorePanel } from '@/features/explore/ExplorePanel';
import { useBudget, useChapters, useEvaluation, useMetaOrThrow, useMoney } from '@/hooks/useStudioData';
import { useStudio } from '@/stores/studio';
import { daysBetween, day, dur, plural, range, stops, time } from '@/lib/format';
import { hotelFullRate, hotelRate, hotelSplit } from '@/lib/lodging';
import { ScenarioSwitcher } from '@/features/compare/ScenarioSwitcher';
import type { TreeNode } from '@/types';

const AtlasMap = lazy(() => import('@/features/atlas/AtlasMap'));

export default function JourneyPage() {
  const meta = useMetaOrThrow();
  const m = useMoney();
  const { sc, nodes } = useChapters();
  const budget = useBudget();
  const ev = useEvaluation();
  const viewOnly = useStudio((s) => s.viewOnly);
  const undo = useStudio((s) => s.undo);
  const undoRemove = useStudio((s) => s.undoRemove);
  const [explore, setExplore] = useState<{ parent: string } | null>(null);
  const confirmed = meta.bookings;
  const legNodes = nodes.filter((n) => n.leg);
  const last = legNodes[legNodes.length - 1];
  const nextCity = budget.summary?.missing_required[0];
  const bday = (ev.of(sc.id, sc.focusId) as { metrics?: { birthday?: { status: string; city: string | null } } } | undefined)?.metrics?.birthday;
  const nm = (c: string) => meta.cities[c]?.name ?? c;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <section aria-labelledby="hero-title">
        <p className="eyebrow">Your journey · 2027</p>
        <h1 id="hero-title" className="display mt-1 text-[44px] font-semibold leading-[1.02] tracking-tight sm:text-6xl">Across continents.</h1>
        <p className="mt-2 text-[15px] text-ink-2">Madrid → China → Russia → Madrid</p>
      </section>

      <Suspense fallback={<Skeleton className="h-52 w-full" />}><div className="h-52 overflow-hidden rounded-2xl border border-line"><AtlasMap compact /></div></Suspense>

      <section className="grid grid-cols-2 gap-3" aria-label="Journey at a glance">
        <Card><p className="eyebrow">Confirmed</p><p className="display mt-1 text-lg font-semibold leading-tight">{confirmed[0] ? `${day(confirmed[0].dep_local)} · ${confirmed[0].origin} → ${confirmed[0].destination}` : '—'}</p><p className="num text-xs text-ink-2">{confirmed[0] ? `${confirmed[0].flight} · arrives ${time(confirmed[0].arr_local)}` : ''}</p>{confirmed[1] && <p className="num mt-1 text-xs text-ink-2">Return {day(confirmed[1].dep_local)} {time(confirmed[1].dep_local)}</p>}</Card>
        <Card><p className="eyebrow">Left to plan</p><p className="num display mt-1 text-lg font-semibold">{budget.summary ? m(budget.remaining) : '…'}</p><p className="text-xs text-ink-2">{plural(legNodes.length, 'segment', 'segments')} · {nextCity ? `next: ${nm(nextCity)}` : budget.summary?.complete ? 'branch complete' : 'keep exploring'}</p></Card>
        <Card className="col-span-2 flex items-center gap-3"><Gift size={20} className="shrink-0 text-gold" aria-hidden /><div className="min-w-0"><p className="eyebrow">14 March</p><p className="text-[15px] font-medium">{bday && bday.city ? `You would be in ${nm(bday.city)}` : 'Protected: no flights that day'}</p></div></Card>
      </section>

      <ScenarioSwitcher />

      <section aria-label="Itinerary timeline">
        <ol className="relative flex flex-col">
          <Chapter node={nodes[0]!} first />
          {nodes.slice(1).map((n, i) => <Chapter key={n.id} node={n} next={nodes[i + 2]} onBranch={() => setExplore({ parent: n.id })} />)}
        </ol>
        {!viewOnly && (
          <div className="mt-1 flex items-center gap-3 pl-1">
            <span className="grid size-10 shrink-0 place-items-center" aria-hidden><span className="h-6 w-px bg-line" /></span>
          </div>
        )}
        <Button variant="primary" size="lg" className="w-full" disabled={viewOnly} onClick={() => setExplore({ parent: last?.id ?? sc.rootId })}><Plus size={18} aria-hidden />Explore next</Button>
        {undo && !viewOnly && <Button className="mt-2 w-full" onClick={undoRemove}><Undo2 size={16} aria-hidden />Undo remove</Button>}
      </section>

      <Sheet open={!!explore} onOpenChange={(o) => !o && setExplore(null)} title="Where next?" description="The journey stays visible behind. Pick a destination, then a flight.">
        {explore && <ExplorePanel parentNodeId={explore.parent} onAdded={() => setExplore(null)} />}
      </Sheet>
    </div>
  );
}

function Chapter({ node, next, first, onBranch }: { node: TreeNode; next?: TreeNode; first?: boolean; onBranch?: () => void }) {
  const meta = useMetaOrThrow();
  const m = useMoney();
  const prefs = useStudio((s) => s.prefs);
  const hotel = useStudio((s) => s.hotel);
  const setNote = useStudio((s) => s.setNote);
  const removeNode = useStudio((s) => s.removeNode);
  const setFocus = useStudio((s) => s.setFocus);
  const viewOnly = useStudio((s) => s.viewOnly);
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();
  const city = node.leg ? meta.airports[node.leg.destination]! : meta.home_city;
  const cm = meta.cities[city];
  const arrive = node.leg ? node.leg.arr_local : meta.bookings[0]?.arr_local;
  const depart = next?.leg?.dep_local ?? (first ? undefined : undefined);
  const nights = arrive && depart ? Math.max(0, daysBetween(arrive, depart)) : null;
  const split = hotelSplit(meta, cm?.country ?? '', prefs.lodging);
  const rate = hotelRate(meta, city, prefs.lodging, hotel[city]);
  const hosted = !!meta.lodging.hosted?.[city] && hotel[city] == null;
  const leg = node.leg;
  return (
    <li className="relative pb-3">
      <span className="absolute bottom-0 left-[19px] top-10 w-px bg-line" aria-hidden />
      <div className="flex gap-3">
        <span className={`relative z-10 mt-1 grid size-10 shrink-0 place-items-center rounded-full border-2 ${first ? 'border-ink bg-ink text-canvas' : 'border-teal bg-surface text-teal'}`} aria-hidden>{first ? <Check size={16} /> : <Plane size={16} />}</span>
        <div className="min-w-0 flex-1">
          <button className="w-full text-left" aria-expanded={open} onClick={() => { setOpen(!open); if (!first) setFocus(node.id); }}>
            <Card className="transition-colors hover:border-teal/40">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="eyebrow truncate">{cm?.country ?? ''}{arrive ? ` · ${range(arrive, depart)}` : ''}</p>
                  <p className="display text-2xl font-semibold uppercase leading-tight tracking-wide">{cm?.name ?? city}</p>
                </div>
                <ChevronDown size={18} className={`mt-1 shrink-0 text-ink-2 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {first ? <Chip tone="teal">Arrival confirmed</Chip> : <Chip tone="gold">Observed fare</Chip>}
                {nights != null && <Chip>{plural(nights, 'night', 'nights')}</Chip>}
                {leg && <Chip><span className="num">{m(leg.price, leg.fx_day)}</span></Chip>}
                {hosted && <Chip tone="good"><Users size={12} aria-hidden />Hosted</Chip>}
                {!hosted && split > 1 && <Chip tone="teal"><Users size={12} aria-hidden />Shared ÷{split}</Chip>}
              </div>
              {leg && <p className="num mt-2 text-sm text-ink-2">{leg.origin} {time(leg.dep_local)} → {leg.destination} {time(leg.arr_local)} · {dur(leg.duration_min)} · {stops(leg.stops).toLowerCase()}</p>}
            </Card>
          </button>
          <AnimatePresence initial={false}>
            {open && (
              <motion.div initial={reduce ? false : { height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }} className="overflow-hidden">
                <Card className="mt-2 flex flex-col gap-3 bg-surface-2 text-sm">
                  {leg && <dl className="grid grid-cols-2 gap-x-3 gap-y-2"><div><dt className="text-xs text-ink-2">Airline</dt><dd className="font-medium">{leg.airlines || 'unknown'}</dd></div><div><dt className="text-xs text-ink-2">Departs</dt><dd className="num font-medium">{day(leg.dep_local)} {time(leg.dep_local)}</dd></div><div><dt className="text-xs text-ink-2">Arrives</dt><dd className="num font-medium">{day(leg.arr_local)} {time(leg.arr_local)}</dd></div><div><dt className="text-xs text-ink-2">Connections</dt><dd className="font-medium">{leg.via.length ? leg.via.map((v) => `${v.airport} ${dur(v.minutes)}`).join(', ') : 'none'}</dd></div></dl>}
                  {nights != null && nights > 0 && <p className="num rounded-lg bg-surface px-3 py-2">Stay {plural(nights, 'night', 'nights')} × {split > 1 ? `${m(hotelFullRate(meta, city, prefs.lodging))} room ÷ ${split}` : m(rate)} = <b>{m(nights * rate)}</b> <span className="text-ink-2">(estimate{hosted ? ', hosted: no lodging cost' : ''})</span></p>}
                  <label className="flex flex-col gap-1 text-xs text-ink-2">Notes
                    <textarea defaultValue={node.note} disabled={viewOnly} onBlur={(e) => setNote(node.id, e.target.value)} rows={2} className="rounded-lg border border-line bg-surface p-2 text-sm text-ink" placeholder="What matters about this stop?" />
                  </label>
                  {!viewOnly && !first && (
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" onClick={onBranch}><Plus size={14} aria-hidden />Explore from here</Button>
                      <Button size="sm" variant="danger" onClick={() => removeNode(node.id)}><Trash2 size={14} aria-hidden />Remove from here</Button>
                    </div>
                  )}
                </Card>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </li>
  );
}
