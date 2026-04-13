/**
 * Air Quality Health Index (AQHI)
 * Source: Environment and Climate Change Canada
 * API: api.weather.gc.ca — AQHI observations realtime collection
 * Filter: latest=true, then filter Toronto-area stations by name
 *
 * Confirmed Toronto stations: Toronto Downtown (FCWYG), Toronto North (FDQBX),
 * Toronto East (FDQBU), Toronto West (FCKTB), Toronto (FEUZB)
 * AQHI scale: 1–3 Low, 4–6 Moderate, 7–10 High, 10+ Very High
 */

import type { PulseEvent, Severity } from './types';

// Always use the local proxy path — Vite handles it in dev, vercel.json in prod.
const AQHI_URL = '/eccc-api/collections/aqhi-observations-realtime/items?lang=en&limit=200&f=json&latest=true';

const TORONTO_STATION_IDS = new Set(['FCWYG', 'FDQBX', 'FDQBU', 'FCKTB', 'FEUZB']);

function aqhiSeverity(aqhi: number): Severity {
  if (aqhi >= 10) return 'critical';
  if (aqhi >= 7) return 'high';
  if (aqhi >= 4) return 'medium';
  return 'low';
}

function aqhiLabel(aqhi: number): string {
  if (aqhi >= 10) return 'Very High Risk';
  if (aqhi >= 7) return 'High Risk';
  if (aqhi >= 4) return 'Moderate Risk';
  return 'Low Risk';
}

export async function fetchAirQuality(): Promise<PulseEvent[]> {
  const res = await fetch(AQHI_URL, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) return [];

  const data = await res.json();
  const features: unknown[] = data?.features ?? [];
  if (features.length === 0) return [];

  const now = Date.now();

  return features
    .filter((feature) => {
      const f = feature as Record<string, unknown>;
      const props = (f['properties'] ?? {}) as Record<string, unknown>;
      return TORONTO_STATION_IDS.has(String(props['location_id'] ?? ''));
    })
    .map((feature, i): PulseEvent => {
      const f = feature as Record<string, unknown>;
      const props = (f['properties'] ?? {}) as Record<string, unknown>;
      const geom = (f['geometry'] as { coordinates?: [number, number] } | null);
      const coords = geom?.coordinates;
      const aqhi = parseFloat(String(props['aqhi'] ?? '3'));
      const stationName = String(props['location_name_en'] ?? '');

      return {
        id: `aqhi-${String(props['location_id'] ?? i)}-${now}`,
        lat: coords ? coords[1] : 43.6532,
        lng: coords ? coords[0] : -79.3832,
        category: 'airquality',
        severity: aqhiSeverity(aqhi),
        timestamp: props['observation_datetime']
          ? new Date(String(props['observation_datetime'])).getTime()
          : now,
        title: `AQHI ${aqhi.toFixed(1)} — ${aqhiLabel(aqhi)}`,
        description: stationName,
        metadata: {
          aqhi: aqhi.toFixed(1),
          station: stationName,
          locationId: String(props['location_id'] ?? ''),
          riskLevel: aqhiLabel(aqhi),
        },
      };
    });
}
