/**
 * Neighbourhood Crime Rates
 * Source: Toronto Open Data
 * GeoJSON: neighbourhood-crime-rates-4326.geojson
 * Fields: AREA_NAME, ASSAULT_2025, ROBBERY_2025, AUTOTHEFT_2025,
 *         BREAKENTER_2025, SHOOTING_2025, HOMICIDE_2025, THEFTFROMMV_2025, THEFTOVER_2025
 *
 * Each neighbourhood polygon is reduced to a centroid for map display.
 * Severity is based on total crime count relative to city-wide distribution.
 */

import type { PulseEvent, Severity } from './types';

const CRIME_RATES_GEOJSON =
  'https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/neighbourhood-crime-rates/resource/47b99279-3e53-4080-8e93-d89fcfe14c77/download/neighbourhood-crime-rates-4326.geojson';

type GeoCoord = [number, number];
type Ring = GeoCoord[];
type Polygon = Ring[];
type MultiPolygon = Polygon[];

function polygonCentroid(rings: Ring[]): GeoCoord {
  const outer = rings[0];
  const n = outer.length;
  let sumLng = 0, sumLat = 0;
  for (const [lng, lat] of outer) {
    sumLng += lng;
    sumLat += lat;
  }
  return [sumLat / n, sumLng / n];
}

function multiPolygonCentroid(polygons: MultiPolygon): GeoCoord {
  // Use centroid of largest polygon (by vertex count)
  const largest = polygons.reduce((a, b) => a[0].length >= b[0].length ? a : b);
  return polygonCentroid(largest);
}

function crimeSeverity(total: number, p75: number, p90: number): Severity {
  if (total >= p90) return 'critical';
  if (total >= p75) return 'high';
  if (total > 0) return 'medium';
  return 'low';
}

const CRIME_FIELDS_2025 = [
  'ASSAULT_2025', 'ROBBERY_2025', 'AUTOTHEFT_2025',
  'BREAKENTER_2025', 'SHOOTING_2025', 'HOMICIDE_2025',
  'THEFTFROMMV_2025', 'THEFTOVER_2025', 'BIKETHEFT_2025',
];

export async function fetchCrimeIncidents(): Promise<PulseEvent[]> {
  const res = await fetch(CRIME_RATES_GEOJSON, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) return [];

  const data = await res.json();
  const features = data?.features ?? [];
  if (features.length === 0) return [];

  const now = Date.now();

  // Compute totals for all neighbourhoods to derive percentile thresholds
  const totals: number[] = features.map((f: Record<string, unknown>) => {
    const props = (f['properties'] ?? {}) as Record<string, unknown>;
    return CRIME_FIELDS_2025.reduce((sum, field) => sum + (parseInt(String(props[field] ?? '0')) || 0), 0);
  });
  const sorted = [...totals].sort((a, b) => a - b);
  const p75 = sorted[Math.floor(sorted.length * 0.75)];
  const p90 = sorted[Math.floor(sorted.length * 0.90)];

  return features.map((feature: Record<string, unknown>, i: number): PulseEvent => {
    const props = (feature['properties'] ?? {}) as Record<string, unknown>;
    const geom = feature['geometry'] as { type: string; coordinates: unknown } | null;

    let lat = 43.6532, lng = -79.3832;
    if (geom?.type === 'MultiPolygon') {
      [lat, lng] = multiPolygonCentroid(geom.coordinates as MultiPolygon);
    } else if (geom?.type === 'Polygon') {
      [lat, lng] = polygonCentroid(geom.coordinates as Polygon);
    }

    const areaName = String(props['AREA_NAME'] ?? '');
    const total = totals[i];

    const breakdown = CRIME_FIELDS_2025
      .filter(f => parseInt(String(props[f] ?? '0')) > 0)
      .map(f => `${f.replace('_2025', '').toLowerCase().replace(/([A-Z])/g, ' $1')}: ${props[f]}`)
      .join(', ');

    return {
      id: `crime-${String(props['HOOD_ID'] ?? i)}-${now}`,
      lat,
      lng,
      category: 'crime',
      severity: crimeSeverity(total, p75, p90),
      timestamp: now,
      title: `${areaName} — ${total} incidents (2025)`,
      description: breakdown || undefined,
      metadata: {
        neighbourhood: areaName,
        hoodId: String(props['HOOD_ID'] ?? ''),
        totalCrimes2025: total,
        assault: String(props['ASSAULT_2025'] ?? 0),
        robbery: String(props['ROBBERY_2025'] ?? 0),
        autoTheft: String(props['AUTOTHEFT_2025'] ?? 0),
        breakEnter: String(props['BREAKENTER_2025'] ?? 0),
        shooting: String(props['SHOOTING_2025'] ?? 0),
      },
    };
  });
}
