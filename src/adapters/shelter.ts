/**
 * Daily Shelter & Overnight Service Occupancy
 * Source: Toronto Open Data
 * Resource: 42714176-4f05-44e6-b157-2b57f29b856a (most recent, datastore_active)
 * Fields: OCCUPANCY_DATE, LOCATION_NAME, LOCATION_ADDRESS, SECTOR,
 *         CAPACITY_ACTUAL_BED, OCCUPIED_BEDS, CAPACITY_ACTUAL_ROOM,
 *         OCCUPIED_ROOMS, OCCUPANCY_RATE_BEDS, OCCUPANCY_RATE_ROOMS
 *
 * Geocoding strategy:
 *   1. Static lookup table for known shelter addresses (fast, reliable)
 *   2. localStorage cache for previously geocoded addresses
 *   3. Nominatim (OpenStreetMap) for new addresses — max 15 per load, 1.2s apart
 *
 * Data is reported nightly; always treat occupancy figures as "last night".
 */

import type { PulseEvent, Severity } from './types';
import { TORONTO_BASE } from './config';

const BASE = `${TORONTO_BASE}/api/3/action/datastore_search`;
const RESOURCE_ID = '42714176-4f05-44e6-b157-2b57f29b856a';
const GEOCACHE_KEY = 'tp_geocache_v1';
const GEOCODE_MAX_NEW = 15;     // max new Nominatim requests per page load
const GEOCODE_DELAY_MS = 1200;  // respect Nominatim's 1 req/s policy

// ─── Static address lookup ────────────────────────────────────────────────────
// Partial street address (case-insensitive) → [lat, lng]
// Covers the most common shelter locations. Everything else falls through to
// the localStorage cache or live Nominatim geocoding.
const ADDRESS_LOOKUP: [string, [number, number]][] = [
  // Downtown core
  ['339 George',       [43.6556, -79.3735]],  // Seaton House
  ['145 Queen St E',   [43.6530, -79.3693]],  // Fred Victor Men's
  ['412 Queen St E',   [43.6543, -79.3651]],  // Good Shepherd
  ['58 Sumach',        [43.6597, -79.3557]],  // Dixon Hall
  ['20 Gerrard',       [43.6571, -79.3774]],  // Covenant House
  ['305 Jarvis',       [43.6612, -79.3730]],  // Homes First
  ['222 Jarvis',       [43.6585, -79.3731]],
  ['191 Jarvis',       [43.6578, -79.3725]],
  ['390 Jarvis',       [43.6632, -79.3720]],
  ['200 Sherbourne',   [43.6589, -79.3706]],
  ['45 Homewood',      [43.6645, -79.3799]],  // Robertson House
  ['129 Peter',        [43.6486, -79.3940]],
  ['160 Frederick',    [43.6524, -79.3694]],
  ['60 Richmond',      [43.6522, -79.3780]],
  ['25 Cecil',         [43.6575, -79.3989]],
  ['174 Elm',          [43.6575, -79.3870]],
  ['10 Elm',           [43.6561, -79.3872]],
  ['20 Shuter',        [43.6537, -79.3748]],
  ['30 Mutual',        [43.6542, -79.3746]],  // The Meeting Place
  ['75 Elizabeth',     [43.6545, -79.3887]],
  ['15 Boul',          [43.6475, -79.3885]],
  // West end
  ['363 Bloor',        [43.6661, -79.4013]],
  ['49 Christie',      [43.6688, -79.4207]],  // Christie Ossington
  ['502 Spadina',      [43.6588, -79.4004]],  // Scott Mission
  ['40 Oak',           [43.6641, -79.3908]],
  ['640 Dixon',        [43.6947, -79.5582]],
  ['627 Evans',        [43.6193, -79.5242]],
  ['545 Lake Shore',   [43.6374, -79.4126]],  // Salvation Army Maxwell Meighen
  ['150 Dunn',         [43.6421, -79.4308]],
  // North end
  ['1 Warring',        [43.6943, -79.4220]],
  ['5734 Yonge',       [43.7820, -79.4145]],  // Eva's Satellite
  ['2100 Ellesmere',   [43.7779, -79.2444]],
  ['1229 Ellesmere',   [43.7769, -79.2531]],  // Birkdale Residence
  ['4211 Kingston',    [43.7705, -79.2290]],
  ['1673 Kingston',    [43.7192, -79.2544]],
  // East end
  ['101 Ontario',      [43.6576, -79.3641]],  // Sojourn House
];

function resolveFromLookup(address: string): [number, number] | null {
  if (!address) return null;
  const upper = address.toUpperCase();
  for (const [key, coords] of ADDRESS_LOOKUP) {
    if (upper.includes(key.toUpperCase())) return coords;
  }
  return null;
}

// ─── localStorage geocache ────────────────────────────────────────────────────

function loadGeoCache(): Map<string, [number, number]> {
  try {
    const raw = localStorage.getItem(GEOCACHE_KEY);
    if (raw) return new Map(JSON.parse(raw) as [string, [number, number]][]);
  } catch { /* ignore */ }
  return new Map();
}

function saveGeoCache(cache: Map<string, [number, number]>): void {
  try {
    localStorage.setItem(GEOCACHE_KEY, JSON.stringify([...cache]));
  } catch { /* ignore — quota exceeded, private browsing, etc. */ }
}

// ─── Nominatim geocoder ───────────────────────────────────────────────────────

async function geocodeNominatim(address: string): Promise<[number, number] | null> {
  try {
    const q = encodeURIComponent(`${address}, Toronto, Ontario, Canada`);
    const url = `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1&countrycodes=ca`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'TorontoPulse/1.0 (portfolio project)' },
      signal: AbortSignal.timeout(7000),
    });
    if (!res.ok) return null;
    const json = await res.json() as { lat: string; lon: string }[];
    if (!Array.isArray(json) || json.length === 0) return null;
    return [parseFloat(json[0].lat), parseFloat(json[0].lon)];
  } catch {
    return null;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Resolve all unique addresses for a record set ───────────────────────────

async function resolveCoordinates(
  addresses: string[]
): Promise<Map<string, [number, number]>> {
  const coordMap = new Map<string, [number, number]>();
  const geocache = loadGeoCache();
  const needsGeocoding: string[] = [];

  for (const addr of addresses) {
    const fromLookup = resolveFromLookup(addr);
    if (fromLookup) {
      coordMap.set(addr, fromLookup);
    } else if (geocache.has(addr)) {
      coordMap.set(addr, geocache.get(addr)!);
    } else {
      needsGeocoding.push(addr);
    }
  }

  // Geocode uncached addresses up to the per-load cap
  const toGeocode = needsGeocoding.slice(0, GEOCODE_MAX_NEW);
  let cacheUpdated = false;

  for (let i = 0; i < toGeocode.length; i++) {
    const addr = toGeocode[i];
    const coords = await geocodeNominatim(addr);
    if (coords) {
      coordMap.set(addr, coords);
      geocache.set(addr, coords);
      cacheUpdated = true;
    }
    // Rate-limit: wait between requests (skip delay after last request)
    if (i < toGeocode.length - 1) {
      await delay(GEOCODE_DELAY_MS);
    }
  }

  if (cacheUpdated) saveGeoCache(geocache);
  return coordMap;
}

// ─── Severity ─────────────────────────────────────────────────────────────────

function shelterSeverity(rate: number): Severity {
  if (rate >= 98) return 'critical';
  if (rate >= 90) return 'high';
  if (rate >= 75) return 'medium';
  return 'low';
}

// ─── Main fetch ───────────────────────────────────────────────────────────────

export async function fetchShelterCapacity(): Promise<PulseEvent[]> {
  const url = `${BASE}?resource_id=${RESOURCE_ID}&limit=300&sort=OCCUPANCY_DATE desc`;
  const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!res.ok) return [];

  const data = await res.json() as { result?: { records?: Record<string, string>[] } };
  const records = data?.result?.records ?? [];
  if (records.length === 0) return [];

  // Only use the most recent night's records
  const mostRecentDate = records[0]?.['OCCUPANCY_DATE'] ?? '';
  const latest = records.filter(r => r['OCCUPANCY_DATE'] === mostRecentDate);

  // Deduplicate by location name, collect unique addresses
  const locationRows = new Map<string, Record<string, string>>();
  for (const row of latest) {
    const name = row['LOCATION_NAME'] ?? '';
    if (name && !locationRows.has(name)) {
      locationRows.set(name, row);
    }
  }

  const uniqueAddresses = [...new Set(
    [...locationRows.values()].map(r => r['LOCATION_ADDRESS'] ?? '').filter(Boolean)
  )];

  const coordMap = await resolveCoordinates(uniqueAddresses);

  // Build PulseEvents
  const now = Date.now();
  const results: PulseEvent[] = [];

  for (const [locationName, row] of locationRows) {
    const address = row['LOCATION_ADDRESS'] ?? '';
    const coords = coordMap.get(address);
    if (!coords) continue;

    // Prefer bed-based figures; fall back to room-based
    const bedCapacity  = parseInt(row['CAPACITY_ACTUAL_BED'] ?? '0') || 0;
    const bedOccupied  = parseInt(row['OCCUPIED_BEDS'] ?? '0') || 0;
    const roomCapacity = parseInt(row['CAPACITY_ACTUAL_ROOM'] ?? '0') || 0;
    const roomOccupied = parseInt(row['OCCUPIED_ROOMS'] ?? '0') || 0;

    const capacity = bedCapacity > 0 ? bedCapacity : roomCapacity;
    const occupied = bedCapacity > 0 ? bedOccupied : roomOccupied;
    const unit     = bedCapacity > 0 ? 'beds' : 'rooms';

    if (capacity === 0) continue;

    const rateRaw = parseFloat(
      bedCapacity > 0
        ? row['OCCUPANCY_RATE_BEDS'] ?? '0'
        : row['OCCUPANCY_RATE_ROOMS'] ?? '0'
    );
    const rate      = isNaN(rateRaw) ? (occupied / capacity) * 100 : rateRaw;
    const available = Math.max(0, capacity - occupied);

    results.push({
      id: `shelter-${row['_id'] ?? locationName}-${now}`,
      lat: coords[0],
      lng: coords[1],
      category: 'shelter',
      severity: shelterSeverity(rate),
      timestamp: now, // use fetch time so events pass the 24h store filter; report date is in metadata.dataDate
      title: `${locationName} — ${available === 0 ? 'At capacity' : `${available} ${unit} available`}`,
      description: `${row['SECTOR'] ?? ''} · ${occupied}/${capacity} ${unit} (${Math.round(rate)}%)`,
      metadata: {
        location:        locationName,
        address,
        sector:          row['SECTOR'] ?? '',
        serviceType:     row['OVERNIGHT_SERVICE_TYPE'] ?? '',
        programModel:    row['PROGRAM_MODEL'] ?? '',
        capacity,
        occupied,
        available,
        occupancyRate:   Math.round(rate),
        unit,
        dataDate:        mostRecentDate,
      },
    });
  }

  return results;
}

// ─── Historical trend for a single location ───────────────────────────────────
// Fetched on-demand when the user clicks a shelter marker.

export interface ShelterHistory {
  nights:   number;   // how many nights of data we got
  avg:      number;   // mean occupancy rate (%)
  min:      number;   // lowest single night (%)
  max:      number;   // highest single night (%)
  trend:    'improving' | 'stable' | 'worsening';
  delta:    number;   // recent avg minus older avg (positive = getting worse)
}

export async function fetchShelterHistory(locationName: string): Promise<ShelterHistory | null> {
  try {
    const filters = encodeURIComponent(JSON.stringify({ LOCATION_NAME: locationName }));
    const url = `${BASE}?resource_id=${RESOURCE_ID}&filters=${filters}&limit=14&sort=OCCUPANCY_DATE%20desc`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;

    const data = await res.json() as { result?: { records?: Record<string, string>[] } };
    const records = data?.result?.records ?? [];
    if (records.length < 3) return null;

    const rates: number[] = records.flatMap(r => {
      const bedCap = parseInt(r['CAPACITY_ACTUAL_BED'] ?? '0') || 0;
      const raw    = parseFloat(
        bedCap > 0 ? r['OCCUPANCY_RATE_BEDS'] ?? '' : r['OCCUPANCY_RATE_ROOMS'] ?? ''
      );
      return isNaN(raw) ? [] : [raw];
    });

    if (rates.length < 3) return null;

    const avg  = Math.round(rates.reduce((a, b) => a + b, 0) / rates.length);
    const min  = Math.round(Math.min(...rates));
    const max  = Math.round(Math.max(...rates));

    // rates[0] is most recent; compare first third vs last third to get direction
    const third      = Math.max(1, Math.floor(rates.length / 3));
    const recentAvg  = rates.slice(0, third).reduce((a, b) => a + b, 0) / third;
    const olderAvg   = rates.slice(-third).reduce((a, b) => a + b, 0) / third;
    const delta      = Math.round(recentAvg - olderAvg);

    const trend: ShelterHistory['trend'] =
      delta >  3 ? 'worsening' :
      delta < -3 ? 'improving' :
      'stable';

    return { nights: rates.length, avg, min, max, trend, delta };
  } catch {
    return null;
  }
}
