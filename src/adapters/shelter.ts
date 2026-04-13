/**
 * Daily Shelter & Overnight Service Occupancy
 * Source: Toronto Open Data
 * Resource: 42714176-4f05-44e6-b157-2b57f29b856a (most recent, datastore_active)
 * Fields: OCCUPANCY_DATE, LOCATION_NAME, LOCATION_ADDRESS, SECTOR,
 *         CAPACITY_ACTUAL_BED, OCCUPIED_BEDS, CAPACITY_ACTUAL_ROOM,
 *         OCCUPIED_ROOMS, OCCUPANCY_RATE_BEDS, OCCUPANCY_RATE_ROOMS
 *
 * Note: Dataset has no coordinates. We geocode by matching LOCATION_ADDRESS
 * against a lookup table of known shelter locations.
 */

import type { PulseEvent, Severity } from './types';
import { TORONTO_BASE } from './config';

const BASE = `${TORONTO_BASE}/api/3/action/datastore_search`;
const RESOURCE_ID = '42714176-4f05-44e6-b157-2b57f29b856a';

// Partial address → [lat, lng] lookup for known shelter locations
const ADDRESS_COORDS: [string, [number, number]][] = [
  ['640 Dixon',       [43.6947, -79.5582]],
  ['129 Peter',       [43.6486, -79.3940]],
  ['160 Frederick',   [43.6524, -79.3694]],
  ['390 Jarvis',      [43.6632, -79.3720]],
  ['545 Lake Shore',  [43.6374, -79.4126]],
  ['60 Richmond',     [43.6522, -79.3780]],
  ['191 Jarvis',      [43.6578, -79.3725]],
  ['25 Cecil',        [43.6575, -79.3989]],
  ['363 Bloor',       [43.6661, -79.4013]],
  ['40 Oak',          [43.6641, -79.3908]],
  ['20 Shuter',       [43.6537, -79.3748]],
  ['174 Elm',         [43.6575, -79.3870]],
  ['10 Elm',          [43.6561, -79.3872]],
  ['627 Evans',       [43.6193, -79.5242]],
  ['1 Warring',       [43.6943, -79.4220]],
  ['2100 Ellesmere',  [43.7779, -79.2444]],
  ['4211 Kingston',   [43.7705, -79.2290]],
  ['200 Sherbourne',  [43.6589, -79.3706]],
  ['222 Jarvis',      [43.6585, -79.3731]],
  ['15 Boul',         [43.6475, -79.3885]],
  ['75 Elizabeth',    [43.6545, -79.3887]],
  ['Toronto',         [43.6532, -79.3832]], // fallback — city centre
];

function resolveAddress(address: string): [number, number] | null {
  if (!address) return null;
  const upper = address.toUpperCase();
  for (const [key, coords] of ADDRESS_COORDS) {
    if (upper.includes(key.toUpperCase())) return coords;
  }
  return null;
}

function shelterSeverity(rate: number): Severity {
  if (rate >= 98) return 'critical';
  if (rate >= 90) return 'high';
  if (rate >= 75) return 'medium';
  return 'low';
}

export async function fetchShelterCapacity(): Promise<PulseEvent[]> {
  // Get most recent date first
  const url = `${BASE}?resource_id=${RESOURCE_ID}&limit=300&sort=OCCUPANCY_DATE desc`;
  const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!res.ok) return [];

  const data = await res.json();
  const records: Record<string, string>[] = data?.result?.records ?? [];
  if (records.length === 0) return [];

  // Only use most recent date's records
  const mostRecentDate = records[0]?.['OCCUPANCY_DATE'] ?? '';
  const latest = records.filter(r => r['OCCUPANCY_DATE'] === mostRecentDate);

  const now = Date.now();
  const seenLocations = new Map<string, boolean>();
  const results: PulseEvent[] = [];

  for (const row of latest) {
    const locationName = row['LOCATION_NAME'] ?? '';
    const address = row['LOCATION_ADDRESS'] ?? '';

    // Deduplicate per location
    if (seenLocations.has(locationName)) continue;
    seenLocations.set(locationName, true);

    const coords = resolveAddress(address);
    if (!coords) continue; // skip locations we can't place on the map

    // Prefer bed-based capacity, fall back to room-based
    const bedCapacity = parseInt(row['CAPACITY_ACTUAL_BED'] ?? '0') || 0;
    const bedOccupied = parseInt(row['OCCUPIED_BEDS'] ?? '0') || 0;
    const roomCapacity = parseInt(row['CAPACITY_ACTUAL_ROOM'] ?? '0') || 0;
    const roomOccupied = parseInt(row['OCCUPIED_ROOMS'] ?? '0') || 0;

    const capacity = bedCapacity > 0 ? bedCapacity : roomCapacity;
    const occupied = bedCapacity > 0 ? bedOccupied : roomOccupied;
    const unit = bedCapacity > 0 ? 'beds' : 'rooms';

    if (capacity === 0) continue;

    const rateRaw = parseFloat(
      bedCapacity > 0
        ? row['OCCUPANCY_RATE_BEDS'] ?? '0'
        : row['OCCUPANCY_RATE_ROOMS'] ?? '0'
    );
    const rate = isNaN(rateRaw) ? (occupied / capacity) * 100 : rateRaw;
    const available = Math.max(0, capacity - occupied);

    results.push({
      id: `shelter-${row['_id'] ?? locationName}-${now}`,
      lat: coords[0],
      lng: coords[1],
      category: 'shelter',
      severity: shelterSeverity(rate),
      timestamp: mostRecentDate ? new Date(mostRecentDate).getTime() : now,
      title: `${locationName} — ${available === 0 ? 'At capacity' : `${available} ${unit} available`}`,
      description: `${row['SECTOR'] ?? ''} · ${occupied}/${capacity} ${unit} (${Math.round(rate)}%)`,
      metadata: {
        location: locationName,
        address,
        sector: row['SECTOR'] ?? '',
        capacity,
        occupied,
        available,
        occupancyRate: Math.round(rate),
        unit,
      },
    });
  }

  return results;
}
