import { feature } from 'topojson-client';
import type { Feature, FeatureCollection, Geometry, Position } from 'geojson';
import type { Topology } from 'topojson-specification';

// Same-origin file (public/geo): no third-party CDN between the user and the country shapes.
export const COUNTRIES_URL = '/geo/countries-110m.json';

export async function loadCountries(): Promise<FeatureCollection> {
  const res = await fetch(COUNTRIES_URL);
  if (!res.ok) throw new Error(`countries file: ${res.status}`);
  const topo = (await res.json()) as Topology;
  return fixAntimeridian(feature(topo, topo.objects.countries as never) as unknown as FeatureCollection);
}

// Natural Earth polygons that straddle ±180° (Russia, Fiji) render as world-wide bands in Mercator.
// Unwrap their longitudes so each ring is continuous, and add a copy shifted by -360 so both edges of the map show it.
export function fixAntimeridian(fc: FeatureCollection): FeatureCollection {
  const unwrap = (ring: Position[]): Position[] => {
    const out: Position[] = [ring[0]!.slice()];
    for (let i = 1; i < ring.length; i++) {
      let x = ring[i]![0]!;
      const px = out[i - 1]![0]!;
      while (x - px > 180) x -= 360;
      while (x - px < -180) x += 360;
      out.push([x, ring[i]![1]!]);
    }
    return out;
  };
  const spans = (ring: Position[]) => { const xs = ring.map((p) => p[0]!); return Math.max(...xs) - Math.min(...xs) > 180; };
  const features: Feature[] = [];
  for (const f of fc.features) {
    if ((f.properties as { name?: string } | null)?.name === 'Antarctica') continue;
    const g = f.geometry as Geometry;
    if (g.type !== 'Polygon' && g.type !== 'MultiPolygon') { features.push(f); continue; }
    const polys: Position[][][] = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    const fixed = polys.map((poly) => poly.map((ring) => (spans(ring) ? unwrap(ring) : ring)));
    const shifted = fixed.filter((poly) => poly[0]!.some((p) => p[0]! > 180)).map((poly) => poly.map((ring) => ring.map(([x, y]) => [x! - 360, y!] as Position)));
    features.push({ ...f, geometry: { type: 'MultiPolygon', coordinates: [...fixed, ...shifted] } });
  }
  return { type: 'FeatureCollection', features };
}
