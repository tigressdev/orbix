// Journey canvas: a tile-less atlas (country polygons) with curved routes and HTML pins, built on MapLibre GL.
// Route states: confirmed (solid ink) · selected (solid teal) · suggested (dashed blue) · exploring (dashed amber).
import { h, reducedMotion } from './ui.js';
import { dur, money, stops, day } from './fmt.js';

const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const COUNTRIES_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json';
const EMPTY = { type: 'FeatureCollection', features: [] };
let map = null, ready = false, pending = null, markers = [], handlers = {}, popup = null;
let lastFit = '', anim = null;
const drawn = new Set();
let firstRender = true;

export function mapAvailable() { return typeof window.maplibregl !== 'undefined'; }

export function initMap(cb) {
  handlers = cb;
  const status = document.getElementById('map-status');
  if (!mapAvailable()) { status.textContent = 'The map library could not be loaded (are you offline?). The journey, tree and budget still work.'; return; }
  map = new window.maplibregl.Map({
    container: 'map',
    style: { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': css('--ocean') || '#e5ece9' } }] },
    bounds: [[-52, -24], [128, 60]],
    fitBoundsOptions: { padding: { top: 70, bottom: 90, left: 40, right: 40 } },
    attributionControl: false, dragRotate: false, pitchWithRotate: false, touchPitch: false, minZoom: window.innerWidth < 700 ? 0 : 0.8, maxZoom: 8,
  });
  map.addControl(new window.maplibregl.AttributionControl({ compact: true, customAttribution: 'Boundaries: Natural Earth via world-atlas' }));
  map.addControl(new window.maplibregl.NavigationControl({ showCompass: false }), 'top-right');
  popup = new window.maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 10 });
  map.on('load', async () => {
    try {
      const topo = await (await fetch(COUNTRIES_URL)).json();
      map.addSource('countries', { type: 'geojson', data: fixAntimeridian(window.topojson.feature(topo, topo.objects.countries)) });
      map.addLayer({ id: 'countries-fill', type: 'fill', source: 'countries', paint: { 'fill-color': css('--land') } });
      map.addLayer({ id: 'countries-line', type: 'line', source: 'countries', paint: { 'line-color': css('--border-geo'), 'line-width': 0.7 } });
    } catch (e) { status.textContent = 'Country outlines could not be loaded; routes and pins still work.'; }
    for (const id of ['confirmed', 'suggested', 'priority', 'selected', 'exploring']) map.addSource(id, { type: 'geojson', data: EMPTY });
    const line = (id, color, width, dash) => map.addLayer({ id: `${id}-line`, type: 'line', source: id, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': color, 'line-width': width, ...(dash ? { 'line-dasharray': dash } : {}) } });
    line('suggested', ['get', 'color'], 1.8, [2, 2.2]);
    map.addLayer({ id: 'priority-halo', type: 'line', source: 'priority', layout: { 'line-cap': 'round' }, paint: { 'line-color': css('--lilac'), 'line-width': 8, 'line-opacity': 0.24 } });
    line('priority', ['get', 'color'], 2.6, [2, 1.8]);
    line('confirmed', css('--ink'), 2.6);
    line('selected', css('--teal'), 3.6);
    line('exploring', css('--amber'), 3.2, [1.6, 1.6]);
    for (const id of ['confirmed', 'suggested', 'priority', 'selected', 'exploring']) {
      map.addLayer({ id: `${id}-hit`, type: 'line', source: id, paint: { 'line-width': 16, 'line-opacity': 0.001, 'line-color': '#000' } });
    }
    map.on('mousemove', (e) => {
      const box = [[e.point.x - 6, e.point.y - 6], [e.point.x + 6, e.point.y + 6]];
      const f = map.queryRenderedFeatures(box, { layers: ['exploring-hit', 'selected-hit', 'confirmed-hit', 'priority-hit', 'suggested-hit'] })[0];
      map.getCanvas().style.cursor = f ? 'pointer' : '';
      if (!f) { popup.remove(); return; }
      popup.setLngLat(e.lngLat).setDOMContent(routeCard(f.properties)).addTo(map);
    });
    map.on('mouseout', () => popup.remove());
    map.on('zoom', () => document.getElementById('map').classList.toggle('labels-on', map.getZoom() >= 4.2));
    ready = true;
    status.textContent = 'Hover a route for price and duration · click a pin to explore';
    if (pending) updateMap(pending);
  });
  map.on('error', () => { /* tile/glyph errors are not expected: there are no tile sources */ });
}

export function resizeMap() { if (map) map.resize(); }

function routeCard(p) {
  const box = h('div', {}, h('div', { style: { fontWeight: 700 } }, `${p.from} → ${p.to}`));
  if (p.kind === 'confirmed') box.append(h('div', { class: 'muted small' }, `${p.flight} · ${day(p.dep)} · confirmed`));
  else {
    box.append(h('div', { class: 'small' }, `${money(+p.price)} · ${dur(+p.duration)} · ${stops(+p.stops)}`));
    if (p.dep) box.append(h('div', { class: 'muted small' }, `${day(p.dep)}${p.airlines ? ' · ' + p.airlines : ''}`));
    if (p.corridor) box.append(h('div', { class: 'tiny', style: { color: p.color, fontWeight: 600 } }, p.corridor));
    box.append(h('div', { class: 'muted tiny' }, { selected: 'In your selected journey', suggested: 'Available alternative', priority: 'Priority destination', exploring: 'Currently evaluating' }[p.kind] || ''));
  }
  return box;
}

// Natural Earth polygons that straddle ±180° (Russia, Fiji) render as world-wide bands in Mercator.
// Unwrap their longitudes so each ring is continuous, and add a copy shifted by -360 so both edges of the map show it.
function fixAntimeridian(fc) {
  const unwrap = (ring) => {
    const out = [ring[0].slice()];
    for (let i = 1; i < ring.length; i++) {
      let x = ring[i][0];
      const px = out[i - 1][0];
      while (x - px > 180) x -= 360;
      while (x - px < -180) x += 360;
      out.push([x, ring[i][1]]);
    }
    return out;
  };
  const spans = (ring) => { const xs = ring.map((p) => p[0]); return Math.max(...xs) - Math.min(...xs) > 180; };
  const features = [];
  for (const f of fc.features) {
    if (f.properties.name === 'Antarctica') continue;
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    const fixed = polys.map((poly) => poly.map((ring) => (spans(ring) ? unwrap(ring) : ring)));
    const shifted = fixed.filter((poly) => poly[0].some((p) => p[0] > 180)).map((poly) => poly.map((ring) => ring.map(([x, y]) => [x - 360, y])));
    features.push({ ...f, geometry: { type: 'MultiPolygon', coordinates: [...fixed, ...shifted] } });
  }
  return { type: 'FeatureCollection', features };
}

// ---- geometry --------------------------------------------------------------------------------
function arc(a, b, bend = 0.2, n = 48) {
  const [x1, y1] = a, [x2, y2] = b;
  const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
  let nx = -dy / len, ny = dx / len;
  if (ny < 0) { nx = -nx; ny = -ny; }          // always bow northwards
  const cx = (x1 + x2) / 2 + nx * len * bend, cy = (y1 + y2) / 2 + ny * len * bend;
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    pts.push([u * u * x1 + 2 * u * t * cx + t * t * x2, u * u * y1 + 2 * u * t * cy + t * t * y2]);
  }
  return pts;
}
const feat = (coords, props) => ({ type: 'Feature', properties: props, geometry: { type: 'LineString', coordinates: coords } });

/**
 * model: {
 *   meta, focusKey, path: [{city, nodeId, idx}], pathLegs: [leg], otherLegs: [leg],
 *   candidates: [{city, price, duration, stops, hot}], hover, wide
 * }
 */
export function updateMap(model) {
  if (!map) return;
  if (!ready) { pending = model; return; }
  pending = null;
  const { meta } = model;
  const pos = (city) => { const c = meta.cities[city]; return [c.lon, c.lat]; };
  const cityOf = (code) => meta.airports[code];
  const CORRIDOR = { 'Europe|Europe': ['--c-eu', 'Europe'], 'Europe|Russia': ['--c-eu-ru', 'Europe–Russia'], 'Asia|Europe': ['--c-eu-as', 'Europe–Asia'],
    'Asia|Russia': ['--c-ru-as', 'Russia–Asia'], 'Asia|Asia': ['--c-as', 'Asia'], 'Russia|Russia': ['--c-eu-ru', 'Russia'] };
  const corridor = (a, b) => {                                  // a, b are city keys
    const k = [meta.cities[a].region, meta.cities[b].region].sort().join('|');
    const [v, label] = CORRIDOR[k] || ['--blue', 'Other'];
    return { color: css(v) || '#5f7f99', corridor: label };
  };

  // countries to tint
  const visited = new Set(['Brazil', 'Spain', ...model.path.map((p) => meta.cities[p.city].country)]);
  const names = [...visited].filter(Boolean);
  if (map.getLayer('countries-fill')) {
    map.setPaintProperty('countries-fill', 'fill-color', names.length ? ['match', ['get', 'name'], names, css('--teal-soft'), css('--land')] : css('--land'));
    map.setPaintProperty('countries-line', 'line-color', css('--border-geo'));
  }
  map.setPaintProperty('bg', 'background-color', css('--ocean'));
  map.setPaintProperty('confirmed-line', 'line-color', css('--ink'));
  map.setPaintProperty('selected-line', 'line-color', css('--teal'));
  map.setPaintProperty('priority-halo', 'line-color', css('--lilac'));
  map.setPaintProperty('exploring-line', 'line-color', css('--amber'));

  // confirmed anchors
  const conf = meta.bookings.map((b, i) => feat(arc(pos(cityOf(b.origin)), pos(cityOf(b.destination)), i ? 0.14 : 0.26),
    { kind: 'confirmed', from: meta.cities[cityOf(b.origin)].name, to: meta.cities[cityOf(b.destination)].name, flight: b.flight, dep: b.dep_local }));
  map.getSource('confirmed').setData({ type: 'FeatureCollection', features: conf });

  // selected path (animate only newly added segments)
  const segs = model.pathLegs.map((l, i) => ({
    key: `${l.origin}>${l.destination}@${l.dep_local}`,
    f: feat(arc(pos(cityOf(l.origin)), pos(cityOf(l.destination)), 0.18 + (i % 2) * 0.06), {
      kind: 'selected', from: meta.cities[cityOf(l.origin)].name, to: meta.cities[cityOf(l.destination)].name,
      price: l.price, duration: l.duration_min, stops: l.stops, dep: l.dep_local, airlines: l.airlines }),
  }));
  const fresh = segs.filter((x) => !drawn.has(x.key));
  const setSelected = (extra) => map.getSource('selected').setData({ type: 'FeatureCollection', features: [...segs.filter((x) => drawn.has(x.key)).map((x) => x.f), ...(extra ? [extra] : [])] });
  if (anim) { cancelAnimationFrame(anim.raf); anim = null; }
  if (!fresh.length || firstRender || reducedMotion()) {
    segs.forEach((x) => drawn.add(x.key));
    setSelected();
  } else {
    const run = (i) => {
      if (i >= fresh.length) { setSelected(); return; }
      const seg = fresh[i], total = seg.f.geometry.coordinates.length, t0 = performance.now(), D = 650;
      const step = (t) => {
        const p = Math.min(1, (t - t0) / D), k = 1 - Math.pow(1 - p, 3), n = Math.max(2, Math.round(total * k));
        setSelected({ ...seg.f, geometry: { type: 'LineString', coordinates: seg.f.geometry.coordinates.slice(0, n) } });
        if (p < 1) anim = { raf: requestAnimationFrame(step) };
        else { drawn.add(seg.key); run(i + 1); }
      };
      anim = { raf: requestAnimationFrame(step) };
    };
    run(0);
  }
  firstRender = false;
  // forget segments that left the selection so re-adding them animates again
  const alive = new Set(segs.map((x) => x.key));
  [...drawn].forEach((k) => { if (!alive.has(k)) drawn.delete(k); });

  // suggested (alternatives): other explored branches + candidate next destinations
  const here = model.path[model.path.length - 1].city;
  const sug = [];
  const seen = new Set();
  for (const l of model.otherLegs) {
    const k = `${l.origin}>${l.destination}`;
    if (seen.has(k) || drawn.has(`${k}@${l.dep_local}`)) continue;
    seen.add(k);
    sug.push(feat(arc(pos(cityOf(l.origin)), pos(cityOf(l.destination)), 0.2), { ...corridor(cityOf(l.origin), cityOf(l.destination)), kind: 'suggested', from: meta.cities[cityOf(l.origin)].name, to: meta.cities[cityOf(l.destination)].name, price: l.price, duration: l.duration_min, stops: l.stops, dep: l.dep_local, airlines: l.airlines }));
  }
  const exploring = [], prio = [];
  for (const c of model.candidates) {
    const isPrio = !!meta.cities[c.city].priority, hot = model.hover === c.city;
    const f = feat(arc(pos(here), pos(c.city), 0.22), { ...corridor(here, c.city), kind: hot ? 'exploring' : isPrio ? 'priority' : 'suggested', from: meta.cities[here].name, to: meta.cities[c.city].name, price: c.price, duration: c.duration, stops: c.stops });
    (hot ? exploring : isPrio ? prio : sug).push(f);
  }
  map.getSource('suggested').setData({ type: 'FeatureCollection', features: sug });
  map.getSource('priority').setData({ type: 'FeatureCollection', features: prio });
  map.getSource('exploring').setData({ type: 'FeatureCollection', features: exploring });

  // pins
  markers.forEach((m) => m.remove());
  markers = [];
  const addPin = (city, cls, label, dotText, onClick, z) => {
    const c = meta.cities[city];
    const pin = h('div', { class: `pin ${cls}`, role: 'button', tabindex: 0, 'aria-label': label, onclick: onClick, onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } },
      h('span', { class: 'dot' }, dotText), h('span', { class: 'lbl' }, c.name));
    const wrap = h('div', { class: 'pinwrap', style: { zIndex: z } }, pin);
    markers.push(new window.maplibregl.Marker({ element: wrap, anchor: 'center' }).setLngLat([c.lon, c.lat]).addTo(map));
  };
  const pathCities = new Set(model.path.map((p) => p.city));
  addPin('SAO_PAULO', 'anchor', 'Sao Paulo, confirmed departure', 'S', () => {}, 2);
  model.candidates.forEach((c) => {
    if (pathCities.has(c.city)) return;
    addPin(c.city, `cand${model.hover === c.city ? ' hot' : ''}${meta.required.includes(c.city) ? ' key' : ''}${meta.cities[c.city].priority ? ' prio' : ''}`, `Explore ${meta.cities[c.city].name}`, '+', () => handlers.onCandidate && handlers.onCandidate(c.city), 3);
  });
  model.path.forEach((p, i) => addPin(p.city, i === 0 ? 'anchor' : '', `${meta.cities[p.city].name}, chapter ${i + 1}`, i === 0 ? 'M' : String(i), () => handlers.onPathCity && handlers.onPathCity(p.nodeId), 5));

  // camera
  const fitKey = `${model.focusKey}|${model.wide}|${document.body.classList.contains('map-mode')}|${model.path.length <= 2 ? model.candidates.length : 0}`;
  if (fitKey !== lastFit) {
    lastFit = fitKey;
    const pts = model.path.map((p) => pos(p.city));
    if (model.path.length <= 2) model.candidates.slice(0, 12).forEach((c) => pts.push(pos(c.city)));
    pts.push(pos(model.path[0].city));
    const lons = pts.map((p) => p[0]), lats = pts.map((p) => p[1]);
    const narrow = window.innerWidth < 820, mapMode = document.body.classList.contains('map-mode');
    const left = narrow || mapMode ? 50 : Math.round(window.innerWidth * 0.36);
    map.fitBounds([[Math.min(...lons) - 6, Math.min(...lats) - 8], [Math.max(...lons) + 6, Math.max(...lats) + 8]], {
      padding: { top: narrow && !mapMode ? 300 : 80, bottom: 60, left, right: narrow ? 30 : 60 }, maxZoom: 5.2, duration: reducedMotion() ? 0 : 900 });
  }
}
