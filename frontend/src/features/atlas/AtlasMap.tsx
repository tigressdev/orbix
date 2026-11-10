import { useEffect, useMemo, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource, Map as MLMap, Marker } from 'maplibre-gl';
import type { FeatureCollection } from 'geojson';
import { loadCountries } from './geo';
import { useChapters, useMetaOrThrow, useNextOptions } from '@/hooks/useStudioData';
import { useStudio } from '@/stores/studio';
import { pathLegs } from '@/lib/tree';
import { Chip } from '@/components/ui/primitives';

const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] };
const css = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || '#888';
const supportsWebGL = () => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; } };

export interface AtlasProps { compact?: boolean; onCityTap?: (city: string) => void; selected?: string | null }

/** Interactive atlas. Same-origin country shapes, ResizeObserver-driven camera, and a visible fallback when the map cannot be drawn. */
export default function AtlasMap({ compact = false, onCityTap, selected = null }: AtlasProps) {
  const meta = useMetaOrThrow();
  const { sc } = useChapters();
  const next = useNextOptions(sc.focusId);
  const theme = useStudio((s) => s.prefs.theme);
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const markers = useRef<Marker[]>([]);
  const [layersReady, setLayersReady] = useState(false);
  const [status, setStatus] = useState<'loading' | 'ready' | 'geo-failed' | 'no-webgl'>(supportsWebGL() ? 'loading' : 'no-webgl');
  const cityPos = (c: string): [number, number] => [meta.cities[c]?.lon ?? 0, meta.cities[c]?.lat ?? 0];

  const model = useMemo(() => {
    const legs = pathLegs(sc, sc.focusId);
    const cities = [meta.home_city, ...legs.map((l) => meta.airports[l.destination]!)];
    const cands = (next.data?.groups ?? []).filter((g) => g.any_ok).slice(0, 14).map((g) => g.city);
    const here = cities[cities.length - 1]!;
    const line = (a: string, b: string, props: Record<string, unknown> = {}) => ({ type: 'Feature' as const, properties: props, geometry: { type: 'LineString' as const, coordinates: [cityPos(a), cityPos(b)] } });
    const selected = { type: 'FeatureCollection' as const, features: cities.slice(1).map((c, i) => line(cities[i]!, c)) };
    const suggested = { type: 'FeatureCollection' as const, features: cands.map((c) => line(here, c, { req: meta.required.includes(c) ? 1 : 0, prio: meta.cities[c]?.priority ? 1 : 0 })) };
    const confirmed = { type: 'FeatureCollection' as const, features: [] };
    return { cities, cands, here, selected, suggested, confirmed };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sc, next.data, meta]);

  useEffect(() => {
    if (!box.current || status === 'no-webgl') return;
    let disposed = false;
    setLayersReady(false);
    const map = new maplibregl.Map({
      container: box.current, center: [60, 40], zoom: 1, minZoom: 0, maxZoom: 7, attributionControl: false, dragRotate: false, pitchWithRotate: false, touchPitch: false,
      cooperativeGestures: compact, style: { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': css('--surface-2') } }] },
    });
    mapRef.current = map;
    if (import.meta.env.DEV || location.search.includes('debug')) (window as unknown as { __map?: MLMap }).__map = map;
    map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: 'Boundaries: Natural Earth' }), 'bottom-left');
    if (!compact) map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(box.current);
    map.on('load', async () => {
      if (disposed) return;
      try {
        map.addSource('countries', { type: 'geojson', data: await loadCountries() });
        map.addLayer({ id: 'land', type: 'fill', source: 'countries', paint: { 'fill-color': css('--sage'), 'fill-opacity': 0.34 } });
        map.addLayer({ id: 'borders', type: 'line', source: 'countries', paint: { 'line-color': css('--surface'), 'line-width': 0.8 } });
        setStatus('ready');
      } catch { setStatus('geo-failed'); }
      for (const id of ['suggested', 'selected']) map.addSource(id, { type: 'geojson', data: EMPTY });
      map.addLayer({ id: 'suggested-line', type: 'line', source: 'suggested', layout: { 'line-cap': 'round' }, paint: { 'line-color': ['case', ['==', ['get', 'req'], 1], css('--lilac'), css('--blue')], 'line-width': 1.6, 'line-dasharray': [2, 2] } });
      map.addLayer({ id: 'selected-line', type: 'line', source: 'selected', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': css('--teal'), 'line-width': 3.2 } });
      setLayersReady(true);
    });
    return () => { disposed = true; ro.disconnect(); markers.current.forEach((m) => m.remove()); markers.current = []; map.remove(); mapRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compact, theme]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      (map.getSource('selected') as GeoJSONSource | undefined)?.setData(model.selected);
      (map.getSource('suggested') as GeoJSONSource | undefined)?.setData(model.suggested);
      markers.current.forEach((m) => m.remove());
      markers.current = [];
      const add = (city: string, cls: string, label: string, bg: string) => {
        const el = document.createElement('button');
        el.type = 'button'; el.className = 'pin'; el.style.background = bg; el.textContent = label; el.setAttribute('aria-label', `${meta.cities[city]?.name ?? city}`);
        if (selected === city) el.style.outline = `3px solid ${css('--gold')}`;
        el.onclick = (e) => { e.stopPropagation(); onCityTap?.(city); };
        markers.current.push(new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat(cityPos(city)).addTo(map));
        void cls;
      };
      model.cands.forEach((c) => add(c, 'cand', '+', meta.required.includes(c) ? css('--lilac') : css('--blue')));
      [...new Set(model.cities)].forEach((c, i) => add(c, 'path', c === meta.home_city ? 'M' : String(i), css('--teal')));
      const pts = [...new Set([...model.cities, ...model.cands])].map(cityPos);
      if (pts.length) {
        const b = pts.reduce((acc, p) => acc.extend(p), new maplibregl.LngLatBounds(pts[0], pts[0]));
        const h = box.current?.clientHeight ?? 300;
        map.fitBounds(b, { padding: { top: 36, bottom: compact ? 28 : Math.min(120, h * 0.2), left: 28, right: 28 }, maxZoom: compact ? 3.2 : 5, duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 600 });
      }
    };
    if (layersReady && map.getSource('selected')) apply();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, selected, status, layersReady]);

  if (status === 'no-webgl') return <MapFallback model={model} reason="This browser cannot draw the interactive map (WebGL is off)." />;
  return (
    <div className="relative size-full min-h-[180px]">
      <div ref={box} style={{ position: 'absolute', inset: 0 }} role="application" aria-label="Interactive route map" data-testid="atlas-map" data-status={status} />
      {status === 'geo-failed' && <div className="absolute inset-x-3 top-3"><Chip tone="risk">Country outlines unavailable: routes and pins still work.</Chip></div>}
      {status === 'loading' && <div className="absolute inset-0 grid place-items-center text-sm text-ink-2" aria-live="polite">Loading map…</div>}
    </div>
  );
}

function MapFallback({ model, reason }: { model: { cities: string[] }; reason: string }) {
  const meta = useMetaOrThrow();
  return (
    <div className="flex size-full flex-col justify-center gap-2 bg-surface-2 p-4 text-sm" role="note">
      <p className="text-ink-2">{reason}</p>
      <p className="display text-lg font-semibold">{model.cities.map((c) => meta.cities[c]?.name ?? c).join(' → ')}</p>
    </div>
  );
}
