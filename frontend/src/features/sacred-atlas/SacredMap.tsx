import { useEffect, useMemo, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource, Map as MLMap, MapLayerMouseEvent } from 'maplibre-gl';
import type { FeatureCollection } from 'geojson';
import { loadCountries } from '@/features/atlas/geo';
import { useChapters, useMetaOrThrow } from '@/hooks/useStudioData';
import { useStudio } from '@/stores/studio';
import { pathLegs } from '@/lib/tree';
import { Chip } from '@/components/ui/primitives';
import { SITES } from './data/sites';
import { TEMPLATES } from './data/journeys';
import { FAMILY_VAR, familyOf, festivalSiteIds, type LayerKey } from './mapModel';

const css = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || '#888';
const supportsWebGL = () => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; } };

export default function SacredMap({ layers, selected, onSelect, templateId }: { layers: Record<LayerKey, boolean>; selected: string | null; onSelect: (id: string) => void; templateId: string | null }) {
  const meta = useMetaOrThrow();
  const { sc } = useChapters();
  const theme = useStudio((s) => s.prefs.theme);
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<'loading' | 'ready' | 'geo-failed' | 'no-webgl'>(supportsWebGL() ? 'loading' : 'no-webgl');
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  const data = useMemo(() => {
    const fest = festivalSiteIds();
    const pos = (id: string): [number, number] | null => {
      const s = SITES.find((x) => x.id === id);
      if (s) return [s.longitude, s.latitude];
      const c = meta.cities[id];
      return c ? [c.lon, c.lat] : null;
    };
    const sites: FeatureCollection = { type: 'FeatureCollection', features: SITES.map((s) => ({ type: 'Feature', properties: { id: s.id, fam: familyOf(s), fest: fest.has(s.id) ? 1 : 0 }, geometry: { type: 'Point', coordinates: [s.longitude, s.latitude] } })) };
    const legs = pathLegs(sc, sc.focusId);
    const cities = [meta.home_city, ...legs.map((l) => meta.airports[l.destination]!)];
    const journey: FeatureCollection = { type: 'FeatureCollection', features: cities.slice(1).map((c, i) => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [pos(cities[i]!)!, pos(c)!].filter(Boolean) } })) };
    const tpl = TEMPLATES.filter((t) => !templateId || t.id === templateId);
    const routes: FeatureCollection = { type: 'FeatureCollection', features: tpl.map((t) => ({ type: 'Feature', properties: { id: t.id }, geometry: { type: 'LineString', coordinates: t.stops.map((s) => pos(s.id)).filter((p): p is [number, number] => !!p) } })) };
    return { sites, journey, routes };
  }, [sc, meta, templateId]);

  useEffect(() => {
    if (!box.current || status === 'no-webgl') return;
    let disposed = false;
    setReady(false);
    const map = new maplibregl.Map({
      container: box.current, center: [80, 32], zoom: 1.6, minZoom: 0.5, maxZoom: 11, attributionControl: false, dragRotate: false, pitchWithRotate: false, touchPitch: false,
      style: { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': css('--surface-2') } }] },
    });
    mapRef.current = map;
    if (import.meta.env.DEV || location.search.includes('debug')) (window as unknown as { __sacredMap?: MLMap }).__sacredMap = map;
    map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: 'Boundaries: Natural Earth (simplified; disputed borders not shown as settled)' }), 'bottom-left');
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(box.current);
    map.on('load', async () => {
      if (disposed) return;
      try {
        map.addSource('countries', { type: 'geojson', data: await loadCountries() });
        map.addLayer({ id: 'land', type: 'fill', source: 'countries', paint: { 'fill-color': css('--sage'), 'fill-opacity': 0.3 } });
        map.addLayer({ id: 'borders', type: 'line', source: 'countries', paint: { 'line-color': css('--surface'), 'line-width': 0.8 } });
        setStatus('ready');
      } catch { setStatus('geo-failed'); }
      if (disposed) return;
      map.addSource('journey', { type: 'geojson', data: data.journey });
      map.addSource('routes', { type: 'geojson', data: data.routes });
      map.addSource('sites', { type: 'geojson', data: data.sites, cluster: true, clusterRadius: 34, clusterMaxZoom: 6 });
      map.addLayer({ id: 'routes-line', type: 'line', source: 'routes', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': css('--gold'), 'line-width': 1.6, 'line-dasharray': [1, 2.5], 'line-opacity': 0.9 } });
      map.addLayer({ id: 'journey-line', type: 'line', source: 'journey', layout: { 'line-cap': 'round' }, paint: { 'line-color': css('--ink-2'), 'line-width': 2.4, 'line-opacity': 0.75 } });
      map.addLayer({ id: 'clusters', type: 'circle', source: 'sites', filter: ['has', 'point_count'], paint: { 'circle-color': css('--ink'), 'circle-opacity': 0.82, 'circle-radius': ['step', ['get', 'point_count'], 13, 3, 17, 5, 21], 'circle-stroke-color': css('--surface'), 'circle-stroke-width': 2 } });
      map.addLayer({ id: 'fest-ring', type: 'circle', source: 'sites', filter: ['all', ['!', ['has', 'point_count']], ['==', ['get', 'fest'], 1]], paint: { 'circle-radius': 13, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': css('--gold'), 'circle-stroke-width': 2.5 } });
      map.addLayer({ id: 'site-dot', type: 'circle', source: 'sites', filter: ['!', ['has', 'point_count']], paint: { 'circle-radius': 7.5, 'circle-color': css('--teal'), 'circle-stroke-color': css('--surface'), 'circle-stroke-width': 2 } });
      map.addLayer({ id: 'site-selected', type: 'circle', source: 'sites', filter: ['==', ['get', 'id'], ''], paint: { 'circle-radius': 11, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': css('--ink'), 'circle-stroke-width': 2.5 } });
      map.on('click', 'clusters', async (e: MapLayerMouseEvent) => {
        const f = e.features?.[0];
        if (!f) return;
        const src = map.getSource('sites') as GeoJSONSource;
        const z = await src.getClusterExpansionZoom(f.properties!.cluster_id as number);
        map.easeTo({ center: (f.geometry as GeoJSON.Point).coordinates as [number, number], zoom: z + 0.3 });
      });
      map.on('click', 'site-dot', (e: MapLayerMouseEvent) => { const id = e.features?.[0]?.properties?.id as string | undefined; if (id) onSelectRef.current(id); });
      for (const l of ['clusters', 'site-dot']) { map.on('mouseenter', l, () => { map.getCanvas().style.cursor = 'pointer'; }); map.on('mouseleave', l, () => { map.getCanvas().style.cursor = ''; }); }
      const b = SITES.reduce((acc, s) => acc.extend([s.longitude, s.latitude]), new maplibregl.LngLatBounds([SITES[0]!.longitude, SITES[0]!.latitude], [SITES[0]!.longitude, SITES[0]!.latitude]));
      map.fitBounds(b, { padding: 40, duration: 0, maxZoom: 4 });
      setReady(true);
    });
    return () => { disposed = true; ro.disconnect(); map.remove(); mapRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    (map.getSource('journey') as GeoJSONSource).setData(data.journey);
    (map.getSource('routes') as GeoJSONSource).setData(data.routes);
    const vis = (id: string, on: boolean) => map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
    vis('journey-line', layers.journey);
    vis('routes-line', layers.routes);
    for (const id of ['clusters', 'site-dot', 'site-selected']) vis(id, layers.sites);
    vis('fest-ring', layers.sites && layers.festivals);
    map.setPaintProperty('site-dot', 'circle-color', layers.traditions
      ? ['match', ['get', 'fam'], 'abrahamic', css(FAMILY_VAR.abrahamic), 'tibetan', css(FAMILY_VAR.tibetan), 'himalayan', css(FAMILY_VAR.himalayan), css(FAMILY_VAR.chinese)]
      : css('--teal'));
    map.setFilter('site-selected', ['all', ['!', ['has', 'point_count']], ['==', ['get', 'id'], selected ?? '']]);
  }, [data, layers, selected, ready]);

  useEffect(() => {
    const map = mapRef.current;
    const s = SITES.find((x) => x.id === selected);
    if (map && ready && s) map.easeTo({ center: [s.longitude, s.latitude], zoom: Math.max(map.getZoom(), 6.5), duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 500 });
  }, [selected, ready]);

  if (status === 'no-webgl') return <div className="grid size-full place-items-center bg-surface-2 p-4 text-sm text-ink-2" role="note">This browser cannot draw the interactive map. Use the list of places below.</div>;
  return (
    <div className="relative size-full">
      <div ref={box} style={{ position: 'absolute', inset: 0 }} role="application" aria-label="Sacred geography map" data-testid="sacred-map" data-status={status} />
      {status === 'geo-failed' && <div className="absolute inset-x-3 top-3"><Chip tone="risk">Country outlines unavailable: places still work.</Chip></div>}
      {status === 'loading' && <div className="absolute inset-0 grid place-items-center text-sm text-ink-2" aria-live="polite">Loading map…</div>}
    </div>
  );
}
