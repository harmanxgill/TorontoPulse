/**
 * DineSafe — Restaurant Health Inspections
 * Source: Toronto Open Data
 * Resource: 29d83dfa-f8b6-4aa2-8e57-12046c1d83e8 (datastore_active: true)
 * Fields: Establishment ID, Establishment Name, Establishment Type,
 *         Establishment Address, Infraction Details, Inspection Date,
 *         Severity, Outcome, Latitude, Longitude
 */

import type { PulseEvent, Severity } from './types';

const BASE = 'https://ckan0.cf.opendata.inter.prod-toronto.ca/api/3/action/datastore_search';
const RESOURCE_ID = '29d83dfa-f8b6-4aa2-8e57-12046c1d83e8';

function outcomeSeverity(outcome: string): Severity {
  const o = outcome?.toUpperCase() ?? '';
  if (o.includes('CLOSED') || o.includes('FAIL')) return 'critical';
  if (o.includes('CONDITIONAL')) return 'medium';
  return 'low'; // Pass
}

export async function fetchRestaurantInspections(): Promise<PulseEvent[]> {
  const url = `${BASE}?resource_id=${RESOURCE_ID}&limit=500&sort=Inspection Date desc`;
  const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!res.ok) return [];

  const data = await res.json();
  const records: Record<string, string>[] = data?.result?.records ?? [];
  if (records.length === 0) return [];

  const now = Date.now();
  const seenIds = new Set<string>();

  return records
    .filter(r => {
      const id = r['Establishment ID'];
      if (!id || seenIds.has(id)) return false;
      seenIds.add(id);
      const lat = parseFloat(r['Latitude'] ?? '0');
      const lng = parseFloat(r['Longitude'] ?? '0');
      return !isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0;
    })
    .map((row, i): PulseEvent => {
      const lat = parseFloat(row['Latitude']);
      const lng = parseFloat(row['Longitude']);
      const outcome = row['Outcome'] ?? 'Pass';
      const name = row['Establishment Name'] ?? 'Establishment';

      return {
        id: `restaurant-${row['_id'] ?? i}-${now}`,
        lat,
        lng,
        category: 'restaurant',
        severity: outcomeSeverity(outcome),
        timestamp: row['Inspection Date'] ? new Date(row['Inspection Date']).getTime() : now,
        title: `${name} — ${outcome}`,
        description: row['Infraction Details'] || undefined,
        metadata: {
          name,
          outcome,
          type: row['Establishment Type'] ?? '',
          address: row['Establishment Address'] ?? '',
          severity: row['Severity'] ?? '',
        },
      };
    });
}
