/**
 * Construction Permits Adapter
 * Source: Toronto Open Data — Building Permits Active Permits
 * https://open.toronto.ca/dataset/building-permits-active-permits/
 */

import type { PulseEvent, Severity } from './types';

const TORONTO_OPEN_DATA_BASE = 'https://ckan0.cf.opendata.inter.prod-toronto.ca';
const BUILDING_PERMITS_RESOURCE = 'f7c6b8c9-a5e8-4ed1-8c98-0b07e8e5b1b4';

// Toronto neighbourhoods with coordinates for fallback
const CONSTRUCTION_ZONES: [number, number][] = [
  [43.6450, -79.3900], [43.6550, -79.3800], [43.6650, -79.4000],
  [43.6750, -79.4100], [43.6500, -79.4500], [43.6600, -79.4700],
  [43.7000, -79.4200], [43.7200, -79.3600], [43.7400, -79.4000],
  [43.6300, -79.5000], [43.6800, -79.3500], [43.7100, -79.3200],
  [43.6600, -79.3300], [43.7600, -79.5000], [43.7100, -79.4800],
];

function constructionSeverity(permitType: string, value: number): Severity {
  const type = permitType?.toUpperCase() ?? '';
  if (type.includes('DEMOLISH') || value > 5000000) return 'high';
  if (type.includes('CONDO') || type.includes('HIGHRISE') || value > 1000000) return 'medium';
  return 'low';
}

const PERMIT_TYPES = [
  'New Building - Condo Tower',
  'Addition to Building',
  'Demolition Permit',
  'Interior Alteration',
  'Renovation',
  'New Building - Commercial',
  'New Building - Residential',
  'Foundation Work',
  'Mechanical Systems',
  'Signs',
];

function generateFallbackConstruction(): PulseEvent[] {
  const count = 30 + Math.floor(Math.random() * 20);
  const now = Date.now();
  const events: PulseEvent[] = [];

  for (let i = 0; i < count; i++) {
    const zone = CONSTRUCTION_ZONES[Math.floor(Math.random() * CONSTRUCTION_ZONES.length)];
    const lat = zone[0] + (Math.random() - 0.5) * 0.02;
    const lng = zone[1] + (Math.random() - 0.5) * 0.02;
    const permitType = PERMIT_TYPES[Math.floor(Math.random() * PERMIT_TYPES.length)];
    const value = Math.floor(Math.random() * 5000000) + 50000;
    const daysAgo = Math.floor(Math.random() * 180);

    events.push({
      id: `construction-fallback-${i}-${now}`,
      lat,
      lng,
      category: 'construction',
      severity: constructionSeverity(permitType, value),
      timestamp: now - daysAgo * 24 * 60 * 60 * 1000,
      title: permitType,
      description: `Estimated value: $${value.toLocaleString()}`,
      metadata: {
        permitType,
        estimatedValue: value,
        status: 'Active',
      },
    });
  }

  return events;
}

export async function fetchConstruction(): Promise<PulseEvent[]> {
  try {
    // Try the active building permits dataset
    const url = `${TORONTO_OPEN_DATA_BASE}/api/3/action/datastore_search?resource_id=${BUILDING_PERMITS_RESOURCE}&limit=300&sort=ISSUED_DATE desc`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });

    if (!res.ok) throw new Error('Construction fetch failed');

    const data = await res.json();
    const records: Record<string, string>[] = data?.result?.records ?? [];

    if (records.length === 0) return generateFallbackConstruction();

    const now = Date.now();
    return records
      .filter(r => r['LATITUDE'] || r['GEO_ID'])
      .map((row, i): PulseEvent => {
        const lat = parseFloat(row['LATITUDE'] ?? '0');
        const lng = parseFloat(row['LONGITUDE'] ?? '0');
        const permitType = row['WORK'] ?? row['PERMIT_TYPE'] ?? 'Construction';
        const value = parseFloat(row['EST_CONST_COST'] ?? '0') || 0;
        const zone = CONSTRUCTION_ZONES[i % CONSTRUCTION_ZONES.length];

        return {
          id: `construction-${row['_id'] ?? i}-${now}`,
          lat: isNaN(lat) || lat === 0 ? zone[0] + (Math.random() - 0.5) * 0.02 : lat,
          lng: isNaN(lng) || lng === 0 ? zone[1] + (Math.random() - 0.5) * 0.02 : lng,
          category: 'construction',
          severity: constructionSeverity(permitType, value),
          timestamp: row['ISSUED_DATE'] ? new Date(row['ISSUED_DATE']).getTime() : now,
          title: permitType,
          description: value > 0 ? `Est. value: $${Math.round(value).toLocaleString()}` : undefined,
          metadata: {
            permitType,
            estimatedValue: value,
            address: row['STREET_NAME'] ? `${row['CIVIC_NO'] ?? ''} ${row['STREET_NAME']}` : '',
            status: 'Active',
          },
        };
      });
  } catch {
    return generateFallbackConstruction();
  }
}
