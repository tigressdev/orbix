import { lazy, Suspense, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Expand, Minimize2 } from 'lucide-react';
import { clsx } from 'clsx';
import { Button, Card, Chip, Skeleton } from '@/components/ui/primitives';
import { SITES } from './data/sites';
import { TRADITION_LABEL } from './data/traditions';
import { CATALOG_VERSION } from './data/journeys';
import { siteFeasibility } from './engine/feasibility';
import { SiteSheet } from './SiteSheet';
import { FeasBadge } from './ui';
import { FAMILY_LABEL, familyOf, type LayerKey } from './mapModel';
import TraditionsMode from './TraditionsMode';
import CalendarMode from './CalendarMode';
import JourneysMode from './JourneysMode';

const SacredMap = lazy(() => import('./SacredMap'));
type Mode = 'geography' | 'traditions' | 'calendar' | 'journeys';
const MODES: { id: Mode; label: string; blurb: string }[] = [
  { id: 'geography', label: 'Sacred Geography', blurb: 'Places and cultural landscapes on the map.' },
  { id: 'traditions', label: 'Traditions', blurb: 'How civilizations answered the same questions.' },
  { id: 'calendar', label: 'Cultural Calendar', blurb: 'Festivals that overlap your dates.' },
  { id: 'journeys', label: 'Journey Alternatives', blurb: 'Feasible itineraries, costed against your plan.' },
];
const LAYERS: { id: LayerKey; label: string }[] = [
  { id: 'journey', label: 'Current Journey' }, { id: 'sites', label: 'Sacred Places' }, { id: 'traditions', label: 'Religious Traditions' }, { id: 'festivals', label: 'Festivals' }, { id: 'routes', label: 'Possible Routes' },
];

export default function SacredAtlasPage() {
  const [sp, setSp] = useSearchParams();
  const mode = (sp.get('mode') as Mode) || 'geography';
  const site = sp.get('site');
  const tab = (sp.get('tab') as 'about' | 'calendar' | 'impact' | null) ?? 'about';
  const set = (k: string, v: string | null, extra: Record<string, string | null> = {}) => {
    const n = new URLSearchParams(sp);
    for (const [kk, vv] of Object.entries({ [k]: v, ...extra })) { if (vv == null) n.delete(kk); else n.set(kk, vv); }
    setSp(n, { replace: k !== 'mode' });
  };
  const openSite = (id: string, t?: string) => set('site', id, { tab: t ?? null });

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6" data-testid="sacred-atlas">
      <header className="flex flex-col gap-3 border-b border-line pb-6 pt-2">
        <p className="eyebrow">Sacred Atlas</p>
        <h1 className="display text-[clamp(2.25rem,8vw,3.75rem)] font-semibold leading-[1.02] tracking-tight">Where civilizations seek meaning.</h1>
        <p className="max-w-2xl text-lg text-ink-2">From Jerusalem to Lhasa, explore the spiritual geographies that shaped human history — and see whether they can become part of your journey.</p>
        <p className="text-xs text-ink-2">A cultural atlas, not a guide to belief: nothing here assumes or infers a traveller’s religion. Catalog {CATALOG_VERSION}.</p>
      </header>

      <nav aria-label="Exploration modes" className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {MODES.map((m, i) => (
          <button key={m.id} onClick={() => set('mode', m.id)} aria-current={mode === m.id ? 'page' : undefined}
            className={clsx('flex min-h-24 flex-col items-start gap-1 rounded-2xl border p-3 text-left transition-colors', mode === m.id ? 'border-teal bg-teal-soft' : 'border-line bg-surface hover:border-teal/40')}>
            <span className="eyebrow !text-[10px]">Mode {String.fromCharCode(65 + i)}</span>
            <span className={clsx('display text-lg font-semibold leading-tight', mode === m.id && 'text-teal')}>{m.label}</span>
            <span className="text-xs text-ink-2">{m.blurb}</span>
          </button>
        ))}
      </nav>

      {mode === 'geography' && <Geography selected={site} onSelect={(id) => openSite(id)} />}
      {mode === 'traditions' && <TraditionsMode onSite={openSite} />}
      {mode === 'calendar' && <CalendarMode onSite={openSite} />}
      {mode === 'journeys' && <JourneysMode onSite={openSite} />}

      <SiteSheet siteId={site} initialTab={tab} onClose={() => set('site', null, { tab: null })} />
    </div>
  );
}

function Geography({ selected, onSelect }: { selected: string | null; onSelect: (id: string) => void }) {
  const [layers, setLayers] = useState<Record<LayerKey, boolean>>({ journey: true, sites: true, traditions: true, festivals: true, routes: false });
  const [full, setFull] = useState(false);
  return (
    <section className="flex flex-col gap-3" aria-label="Sacred geography">
      <div className="hscroll" role="group" aria-label="Map layers">
        {LAYERS.map((l) => (
          <button key={l.id} aria-pressed={layers[l.id]} onClick={() => setLayers((x) => ({ ...x, [l.id]: !x[l.id] }))}
            className={clsx('min-h-10 shrink-0 rounded-full border px-3.5 text-sm font-semibold', layers[l.id] ? 'border-ink bg-ink text-canvas' : 'border-line bg-surface text-ink-2')}>{l.label}</button>
        ))}
      </div>
      <div className={clsx('overflow-hidden border border-line bg-surface-2', full ? 'fixed inset-0 z-40 rounded-none' : 'relative h-[58dvh] min-h-[300px] rounded-2xl lg:h-[520px]')}>
        <Suspense fallback={<Skeleton className="size-full" />}><SacredMap layers={layers} selected={selected} onSelect={onSelect} templateId={null} /></Suspense>
        <Button size="sm" className="absolute left-3 top-3 z-10 shadow" onClick={() => setFull((f) => !f)} aria-label={full ? 'Exit full-screen map' : 'Full-screen map'} style={full ? { top: 'max(0.75rem, var(--safe-t))' } : undefined}>
          {full ? <Minimize2 size={16} aria-hidden /> : <Expand size={16} aria-hidden />}{full ? 'Close' : 'Full screen'}
        </Button>
        {full && <div className="absolute inset-x-3 z-10" style={{ bottom: 'calc(0.75rem + var(--safe-b))' }}><PlaceStrip selected={selected} onSelect={onSelect} /></div>}
      </div>
      <Legend layers={layers} />
      <h2 className="display mt-2 text-2xl font-semibold">Places</h2>
      <ul className="grid gap-2 sm:grid-cols-2">
        {SITES.map((s) => {
          const f = siteFeasibility(s);
          return (
            <li key={s.id}>
              <button onClick={() => onSelect(s.id)} className="block w-full text-left" data-testid={`site-${s.id}`}>
                <Card className={clsx('flex h-full flex-col gap-1.5 hover:border-teal/50', selected === s.id && 'border-teal')}>
                  <p className="eyebrow !text-[10px]">{s.country} · {s.region}</p>
                  <p className="display text-xl font-semibold leading-tight">{s.name} {s.originalName && <span className="text-base font-normal text-ink-2">{s.originalName.split(' · ')[0]}</span>}</p>
                  <p className="text-sm text-ink-2">{s.traditions.map((t) => TRADITION_LABEL[t]).join(' · ')}</p>
                  <p className="text-sm">{s.significance}</p>
                  <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1"><FeasBadge s={f.status} />{s.suggestedDuration && <Chip>{s.suggestedDuration.minDays}–{s.suggestedDuration.maxDays} days</Chip>}
                    {s.nearbyTransportHubs[0] && <Chip>via {s.nearbyTransportHubs[0].name}</Chip>}</div>
                </Card>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function PlaceStrip({ selected, onSelect }: { selected: string | null; onSelect: (id: string) => void }) {
  return (
    <div className="hscroll rounded-2xl bg-surface/95 p-1.5 shadow-lg backdrop-blur">
      {SITES.map((s) => <button key={s.id} onClick={() => onSelect(s.id)} className={clsx('min-h-10 shrink-0 rounded-xl px-3 text-sm font-semibold', selected === s.id ? 'bg-teal text-white' : 'text-ink')}>{s.name}</button>)}
    </div>
  );
}

function Legend({ layers }: { layers: Record<LayerKey, boolean> }) {
  const fams = [...new Set(SITES.map(familyOf))];
  const VAR = { abrahamic: 'var(--blue)', chinese: 'var(--teal)', tibetan: 'var(--lilac)', himalayan: 'var(--gold)' } as const;
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-ink-2" aria-label="Map legend">
      {layers.traditions ? fams.map((f) => <span key={f} className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full" style={{ background: VAR[f] }} />{FAMILY_LABEL[f]}</span>)
        : <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-teal" />Sacred place</span>}
      <span className="inline-flex items-center gap-1.5"><span className="size-3 rounded-full border-2 border-ink bg-ink/80" />Group of places: tap to zoom</span>
      {layers.festivals && <span className="inline-flex items-center gap-1.5"><span className="size-3 rounded-full border-2 border-gold" />Observance in your window</span>}
      {layers.journey && <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 bg-ink-2" />Your active branch</span>}
      {layers.routes && <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 border-t-2 border-dotted border-gold" />Template order (not a transport link)</span>}
    </div>
  );
}
