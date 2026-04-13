/**
 * Toronto Neighbourhood Boundaries
 * Source: Toronto Open Data — Neighbourhoods
 * https://open.toronto.ca/dataset/neighbourhoods/
 *
 * Fetched once at startup. Used for point-in-polygon lookups
 * so every map click resolves to a real neighbourhood name.
 */

import { TORONTO_BASE } from './config';

// WGS84 (EPSG:4326) GeoJSON — matches map coordinates directly
const NEIGHBOURHOODS_GEOJSON = `${TORONTO_BASE}/dataset/fc443770-ef0a-4025-9c2c-2cb558bfab00/resource/0719053b-28b7-48ea-b863-068823a93aaa/download/neighbourhoods-4326.geojson`;

interface NeighbourhoodFeature {
  type: 'Feature';
  properties: { AREA_NAME: string; AREA_SHORT_CODE?: string };
  geometry: {
    type: 'Polygon' | 'MultiPolygon';
    coordinates: number[][][] | number[][][][];
  };
}

let cachedFeatures: NeighbourhoodFeature[] = [];
let fetchPromise: Promise<void> | null = null;

/**
 * Ray-casting point-in-polygon for a single ring.
 * Returns true if [lng, lat] is inside the polygon ring.
 */
function pointInRing(lng: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  const n = ring.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const intersect =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointInPolygon(lng: number, lat: number, feature: NeighbourhoodFeature): boolean {
  const { type, coordinates } = feature.geometry;

  if (type === 'Polygon') {
    const rings = coordinates as number[][][];
    // Must be inside outer ring and outside all holes
    if (!pointInRing(lng, lat, rings[0])) return false;
    for (let i = 1; i < rings.length; i++) {
      if (pointInRing(lng, lat, rings[i])) return false;
    }
    return true;
  }

  if (type === 'MultiPolygon') {
    const polygons = coordinates as number[][][][];
    return polygons.some(rings => {
      if (!pointInRing(lng, lat, rings[0])) return false;
      for (let i = 1; i < rings.length; i++) {
        if (pointInRing(lng, lat, rings[i])) return false;
      }
      return true;
    });
  }

  return false;
}

export async function loadNeighbourhoods(): Promise<void> {
  if (cachedFeatures.length > 0) return;
  if (fetchPromise) return fetchPromise;

  fetchPromise = (async () => {
    try {
      const res = await fetch(NEIGHBOURHOODS_GEOJSON, {
        signal: AbortSignal.timeout(12000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const geojson = await res.json();
      cachedFeatures = geojson?.features ?? [];
    } catch {
      // Boundaries unavailable — findNeighbourhood will return null
      cachedFeatures = [];
    }
  })();

  return fetchPromise;
}

/**
 * Returns the Toronto neighbourhood name for a given coordinate,
 * or null if the point is outside all neighbourhoods or data not loaded.
 */
export function findNeighbourhood(lat: number, lng: number): string | null {
  for (const feature of cachedFeatures) {
    if (pointInPolygon(lng, lat, feature)) {
      return feature.properties.AREA_NAME ?? null;
    }
  }
  return null;
}
