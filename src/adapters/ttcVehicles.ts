/**
 * TTC GTFS-Realtime Vehicle Positions — subway only.
 *
 * Feed: https://gtfs.torontotransit.com/GTFSRealtime.ashx?Type=VehiclePosition
 * Proxied via /ttc-gtfs/* in dev.
 *
 * Only route IDs '1', '2', '4' (Lines 1/2/4) are kept.
 * Buses and streetcars are filtered out to avoid 2,000+ points.
 *
 * Positions are cached in module scope. Call refreshVehiclePositions() on
 * a 15-second interval; the layer builder reads getVehiclePositions() each
 * time refreshLayers() is called.
 */

import { transit_realtime } from 'gtfs-realtime-bindings';

const VEHICLE_POSITION_URL = `${
  import.meta.env.DEV ? '/ttc-gtfs' : 'https://gtfs.torontotransit.com'
}/GTFSRealtime.ashx?Type=VehiclePosition`;

const SUBWAY_ROUTE_IDS = new Set(['1', '2', '4']);

export interface SubwayVehicle {
  id:      string;
  lat:     number;
  lng:     number;
  routeId: string;
  bearing: number; // degrees, 0 = north — 0 when unavailable
}

// Module-level cache — mutated by refreshVehiclePositions()
let cache: SubwayVehicle[] = [];

export function getVehiclePositions(): SubwayVehicle[] {
  return cache;
}

export async function refreshVehiclePositions(): Promise<void> {
  let buffer: ArrayBuffer;
  try {
    const res = await fetch(VEHICLE_POSITION_URL, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return;
    buffer = await res.arrayBuffer();
  } catch {
    return; // leave existing cache intact on transient error
  }

  let feed: transit_realtime.FeedMessage;
  try {
    feed = transit_realtime.FeedMessage.decode(new Uint8Array(buffer));
  } catch {
    return;
  }

  const vehicles: SubwayVehicle[] = [];

  for (const entity of feed.entity ?? []) {
    const vp = entity.vehicle;
    if (!vp) continue;

    const routeId = vp.trip?.routeId ?? '';
    if (!SUBWAY_ROUTE_IDS.has(routeId)) continue;

    const lat = vp.position?.latitude;
    const lng = vp.position?.longitude;
    if (!lat || !lng) continue;

    vehicles.push({
      id:      entity.id ?? String(vehicles.length),
      lat,
      lng,
      routeId,
      bearing: vp.position?.bearing ?? 0,
    });
  }

  cache = vehicles;
}
