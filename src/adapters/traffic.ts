/**
 * Road Restrictions (Road Closures & Traffic Incidents)
 * Source: Toronto Open Data — Road Restrictions Version 3
 * Resource: Direct JSON download (no datastore API — CORS-accessible direct URL)
 * URL: https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/road-restrictions/resource/421c8a17-4ecf-4cae-b084-ccb005ea6cc3/download/
 * Structure: { "Closure": [ { id, road, name, district, latitude, longitude, workEventType, ... } ] }
 */

import type { PulseEvent, Severity } from './types';
import { TORONTO_BASE } from './config';

const ROAD_JSON_URL = `${TORONTO_BASE}/dataset/road-restrictions/resource/421c8a17-4ecf-4cae-b084-ccb005ea6cc3/download/Road%20Restrictions%20%28Version%203%29%20-%20JSON.json`;

function trafficSeverity(workEventType: string, roadClass: string): Severity {
  const type = workEventType?.toLowerCase() ?? '';
  const road = roadClass?.toLowerCase() ?? '';
  if (type.includes('emergency')) return 'critical';
  if (road.includes('expressway') || road.includes('major arterial')) return 'high';
  if (type.includes('closure') || type.includes('construction')) return 'medium';
  return 'low';
}

interface RoadClosureRaw {
  id: string;
  road: string;
  name: string;
  district: string;
  latitude: string;
  longitude: string;
  roadClass: string;
  workEventType: string;
  startTime: string;
  endTime: string | null;
  workPeriod: string;
  planned: number;
}

export async function fetchTrafficIncidents(): Promise<PulseEvent[]> {
  const res = await fetch(ROAD_JSON_URL, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) return [];

  // This feed contains invalid JSON escape sequences (bare backslashes in string values).
  // Fetch as text and sanitize before parsing.
  const raw = await res.text();
  const sanitized = raw.replace(/\\(?!["\\/bfnrtu])/g, '\\\\');
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(sanitized);
  } catch {
    return [];
  }
  const closures: RoadClosureRaw[] = (data?.['Closure'] as RoadClosureRaw[] | undefined) ?? [];
  if (closures.length === 0) return [];

  const now = Date.now();

  return closures
    .filter(c => {
      const lat = parseFloat(c.latitude ?? '0');
      const lng = parseFloat(c.longitude ?? '0');
      return !isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0;
    })
    .map((c): PulseEvent => {
      const lat = parseFloat(c.latitude);
      const lng = parseFloat(c.longitude);
      const start = c.startTime ? parseInt(c.startTime) : now;

      return {
        id: `traffic-${c.id}`,
        lat,
        lng,
        category: 'traffic',
        severity: trafficSeverity(c.workEventType, c.roadClass),
        timestamp: start,
        title: c.name || c.road || 'Road Restriction',
        description: [c.district, c.workPeriod].filter(Boolean).join(' · ') || undefined,
        metadata: {
          road: c.road,
          district: c.district,
          roadClass: c.roadClass,
          workEventType: c.workEventType,
          planned: c.planned ? 'Yes' : 'No',
          endTime: c.endTime ?? 'Ongoing',
        },
      };
    });
}
