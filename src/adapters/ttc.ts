/**
 * TTC Delays — GTFS-Realtime Service Alerts only.
 *
 * Source: TTC GTFS-Realtime Service Alerts feed (live, protobuf).
 *   URL: https://gtfs.torontotransit.com/GTFSRealtime.ashx?Type=ServiceAlert
 *   Proxied via /ttc-gtfs/* in dev to bypass CORS.
 *
 * No CSV fallback. The historical Toronto Open Data delay CSV carries no
 * reliable fetch timestamp — records could be days old. Showing stale
 * incidents as live data is misleading, so we return [] when the RT feed
 * has no active alerts.
 */

import type { PulseEvent } from './types';
import { fetchGtfsServiceAlerts } from './ttcGtfs';

export async function fetchTTCDelays(): Promise<PulseEvent[]> {
  return fetchGtfsServiceAlerts();
}
