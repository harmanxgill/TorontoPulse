/**
 * TTC GTFS-Realtime Service Alerts
 * Source: https://gtfs.torontotransit.com/GTFSRealtime.ashx?Type=ServiceAlert
 * Protobuf feed parsed via gtfs-realtime-bindings.
 *
 * Returns one PulseEvent per active service alert, positioned at the
 * centroid of the affected subway route(s) or nearest known station.
 */

import { transit_realtime } from 'gtfs-realtime-bindings';
import type { PulseEvent, Severity } from './types';

// In dev: proxied via Vite (/ttc-gtfs → https://gtfs.torontotransit.com)
// In prod: needs a serverless proxy or CORS-enabled CDN mirror
const GTFS_RT_BASE = import.meta.env.DEV
  ? '/ttc-gtfs'
  : 'https://gtfs.torontotransit.com';

const SERVICE_ALERT_URL = `${GTFS_RT_BASE}/GTFSRealtime.ashx?Type=ServiceAlert`;

// ─── Route metadata ───────────────────────────────────────────────────────────

interface RouteInfo {
  name:    string;       // Human-readable
  lat:     number;
  lng:     number;
  mode:    'subway' | 'streetcar' | 'bus';
}

// Subway lines — keyed by GTFS route_id
const SUBWAY_ROUTES: Record<string, RouteInfo> = {
  '1': { name: 'Line 1 (Yonge-University)', lat: 43.6710, lng: -79.3857, mode: 'subway' },
  '2': { name: 'Line 2 (Bloor-Danforth)',   lat: 43.6710, lng: -79.3857, mode: 'subway' },
  '4': { name: 'Line 4 (Sheppard)',          lat: 43.7615, lng: -79.4106, mode: 'subway' },
};

// Common streetcar routes (approx mid-route position)
const STREETCAR_ROUTES: Record<string, RouteInfo> = {
  '501': { name: 'Route 501 Queen',       lat: 43.6524, lng: -79.3797, mode: 'streetcar' },
  '504': { name: 'Route 504 King',        lat: 43.6489, lng: -79.3774, mode: 'streetcar' },
  '505': { name: 'Route 505 Dundas',      lat: 43.6556, lng: -79.3800, mode: 'streetcar' },
  '506': { name: 'Route 506 Carlton',     lat: 43.6606, lng: -79.3800, mode: 'streetcar' },
  '509': { name: 'Route 509 Harbourfront',lat: 43.6400, lng: -79.3850, mode: 'streetcar' },
  '510': { name: 'Route 510 Spadina',     lat: 43.6673, lng: -79.4036, mode: 'streetcar' },
  '511': { name: 'Route 511 Bathurst',    lat: 43.6665, lng: -79.4112, mode: 'streetcar' },
  '512': { name: 'Route 512 St. Clair',   lat: 43.6881, lng: -79.3916, mode: 'streetcar' },
};

// ─── Enum label maps ──────────────────────────────────────────────────────────

const CAUSE_LABELS: Record<number, string> = {
  1:  'Unknown cause',
  2:  'Other cause',
  3:  'Technical problem',
  4:  'Strike',
  5:  'Demonstration',
  6:  'Accident',
  7:  'Holiday',
  8:  'Weather',
  9:  'Maintenance',
  10: 'Construction',
  11: 'Police activity',
  12: 'Medical emergency',
};

const EFFECT_LABELS: Record<number, string> = {
  1:  'No service',
  2:  'Reduced service',
  3:  'Significant delays',
  4:  'Detour',
  5:  'Additional service',
  6:  'Modified service',
  7:  'Other effect',
  8:  'Unknown effect',
  9:  'Stop moved',
  10: 'No effect',
  11: 'Accessibility issue',
};

function effectSeverity(effect: number): Severity {
  switch (effect) {
    case 1: return 'critical'; // No service
    case 3: return 'high';     // Significant delays
    case 2:                    // Reduced service
    case 4: return 'medium';   // Detour
    default: return 'low';
  }
}

// ─── Text helpers ─────────────────────────────────────────────────────────────

function translatedText(t: transit_realtime.ITranslatedString | null | undefined): string {
  if (!t?.translation?.length) return '';
  // Prefer English, fall back to first available
  const en = t.translation.find(tr => !tr.language || tr.language === 'en');
  return (en ?? t.translation[0]).text ?? '';
}

function toTitleCase(str: string): string {
  return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

// ─── Main fetch ───────────────────────────────────────────────────────────────

export async function fetchGtfsServiceAlerts(): Promise<PulseEvent[]> {
  let buffer: ArrayBuffer;
  try {
    const res = await fetch(SERVICE_ALERT_URL, {
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return [];
    buffer = await res.arrayBuffer();
  } catch {
    return [];
  }

  let feed: transit_realtime.FeedMessage;
  try {
    feed = transit_realtime.FeedMessage.decode(new Uint8Array(buffer));
  } catch {
    return [];
  }

  const events: PulseEvent[] = [];
  const now = Date.now();
  const seen = new Set<string>(); // deduplicate alerts with identical header text

  for (const entity of feed.entity ?? []) {
    const alert = entity.alert;
    if (!alert) continue;

    const header      = translatedText(alert.headerText);
    const description = translatedText(alert.descriptionText);
    if (!header) continue;

    // Deduplicate by header text
    if (seen.has(header)) continue;
    seen.add(header);

    const effect  = (alert.effect as number) ?? 8;
    const cause   = (alert.cause  as number) ?? 1;
    const severity = effectSeverity(effect);

    const effectLabel = EFFECT_LABELS[effect] ?? 'Alert';
    const causeLabel  = CAUSE_LABELS[cause]  ?? '';

    // Collect all route IDs and stop IDs from informedEntity
    const routeIds: string[] = [];
    const stopIds:  string[] = [];
    for (const selector of alert.informedEntity ?? []) {
      if (selector.routeId) routeIds.push(selector.routeId);
      if (selector.stopId)  stopIds.push(selector.stopId);
      if (selector.trip?.routeId) routeIds.push(selector.trip.routeId);
    }

    // Resolve position: prefer subway, then streetcar, then skip
    let routeInfo: RouteInfo | null = null;
    for (const rid of routeIds) {
      if (SUBWAY_ROUTES[rid])    { routeInfo = SUBWAY_ROUTES[rid];    break; }
      if (STREETCAR_ROUTES[rid]) { routeInfo = STREETCAR_ROUTES[rid]; break; }
    }
    // If no known route, use Toronto centre (covers bus-only alerts)
    if (!routeInfo) {
      routeInfo = { name: 'TTC', lat: 43.6532, lng: -79.3832, mode: 'bus' };
    }

    // Build a clean route label from all affected routes
    const affectedRouteNames = [...new Set(
      routeIds.map(rid =>
        SUBWAY_ROUTES[rid]?.name ??
        STREETCAR_ROUTES[rid]?.name ??
        `Route ${rid}`
      )
    )];
    const routeLabel = affectedRouteNames.length > 0
      ? affectedRouteNames.join(', ')
      : routeInfo.name;

    const descParts: string[] = [routeLabel];
    if (causeLabel && causeLabel !== 'Unknown cause' && causeLabel !== 'Other cause') {
      descParts.push(causeLabel);
    }
    if (description) descParts.push(description);

    events.push({
      id: `gtfs-alert-${entity.id ?? now}-${events.length}`,
      lat: routeInfo.lat,
      lng: routeInfo.lng,
      category: 'ttc',
      severity,
      timestamp: now,
      title: toTitleCase(header),
      description: descParts.filter(Boolean).join(' · '),
      metadata: {
        alertId:    entity.id ?? '',
        effect:     effectLabel,
        cause:      causeLabel,
        routes:     routeIds.join(', '),
        routeNames: routeLabel,
        mode:       routeInfo.mode,
        stops:      stopIds.slice(0, 5).join(', '),
        source:     'GTFS-RT',
      },
    });
  }

  return events;
}
