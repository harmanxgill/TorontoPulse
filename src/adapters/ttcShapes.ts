/**
 * TTC Subway Line Shapes
 *
 * Hardcoded station-waypoint paths for Lines 1, 2, and 4.
 * These are permanent infrastructure — no API call needed.
 *
 * Path format: [longitude, latitude][] (deck.gl convention)
 *
 * Color is derived at render time from active GTFS-RT alerts in the store:
 *   green  — no active alerts
 *   yellow — reduced service / detour / modified service
 *   red    — no service / significant delays
 */

import type { PulseEvent } from './types';

export type LngLat = [number, number];

export interface SubwayLine {
  id:      string;
  name:    string;
  routeId: string; // TTC GTFS route_id used in service alert informedEntity
  path:    LngLat[];
}

// ─── Status colours ───────────────────────────────────────────────────────────

const GREEN:  [number, number, number, number] = [30,  185, 80,  220];
const YELLOW: [number, number, number, number] = [220, 180, 0,   230];
const RED:    [number, number, number, number] = [220, 50,  50,  240];

const MAJOR_EFFECTS = new Set(['No service', 'Significant delays']);
const MINOR_EFFECTS = new Set(['Reduced service', 'Detour', 'Modified service', 'Accessibility issue']);

/**
 * Returns the RGBA colour for a subway line given the current TTC events.
 * Worst active effect wins (red > yellow > green).
 */
export function lineStatusColor(
  routeId: string,
  ttcEvents: PulseEvent[],
): [number, number, number, number] {
  let worst = 0; // 0 = green, 1 = yellow, 2 = red

  for (const ev of ttcEvents) {
    const routes = String(ev.metadata?.['routes'] ?? '').split(',').map(r => r.trim());
    if (!routes.includes(routeId)) continue;

    const effect = String(ev.metadata?.['effect'] ?? '');
    if (MAJOR_EFFECTS.has(effect)) { worst = 2; break; }
    if (MINOR_EFFECTS.has(effect) && worst < 1) worst = 1;
  }

  if (worst === 2) return RED;
  if (worst === 1) return YELLOW;
  return GREEN;
}

// ─── Line 1 — Yonge-University ────────────────────────────────────────────────
//
// Traces the U-shape: south along Yonge St from Finch to Union,
// then north along University Ave / Spadina to Vaughan.
//
const LINE1_PATH: LngLat[] = [
  // — Yonge branch (north → south) —
  [-79.4147, 43.7800], // Finch
  [-79.4106, 43.7615], // Sheppard-Yonge
  [-79.4074, 43.7452], // York Mills
  [-79.4040, 43.7262], // Lawrence
  [-79.3983, 43.7071], // Eglinton
  [-79.3974, 43.6981], // Davisville
  [-79.3916, 43.6881], // St Clair
  [-79.3849, 43.6818], // Summerhill
  [-79.3829, 43.6764], // Rosedale
  [-79.3857, 43.6710], // Bloor-Yonge
  [-79.3827, 43.6651], // Wellesley
  [-79.3813, 43.6601], // College
  [-79.3800, 43.6556], // Dundas
  [-79.3797, 43.6524], // Queen
  [-79.3774, 43.6489], // King
  [-79.3806, 43.6452], // Union  ← bottom of U
  // — University branch (south → north) —
  [-79.3842, 43.6477], // St Andrew
  [-79.3876, 43.6504], // Osgoode
  [-79.3907, 43.6546], // St Patrick
  [-79.3934, 43.6601], // Queen's Park
  [-79.3944, 43.6672], // Museum
  [-79.3899, 43.6702], // Bay
  [-79.3997, 43.6680], // St George
  [-79.4036, 43.6673], // Spadina (interchange with Line 2)
  [-79.4083, 43.6745], // Dupont
  [-79.4145, 43.6826], // St Clair West
  [-79.4348, 43.7126], // Glencairn
  [-79.4489, 43.7266], // Lawrence West
  [-79.4530, 43.7243], // Yorkdale
  [-79.4604, 43.7337], // Wilson
  [-79.4789, 43.7523], // Sheppard West
  [-79.4972, 43.7627], // Downsview Park
  [-79.5444, 43.7762], // Finch West
  [-79.5013, 43.7741], // York University
  [-79.5291, 43.7861], // Pioneer Village
  [-79.5338, 43.7818], // Highway 407
  [-79.5385, 43.7950], // Vaughan Metropolitan Centre
];

// ─── Line 2 — Bloor-Danforth ──────────────────────────────────────────────────
//
// East-west along Bloor St W and Danforth Ave.
// Kipling (west) → Kennedy (east).
//
const LINE2_PATH: LngLat[] = [
  [-79.5359, 43.6365], // Kipling
  [-79.5239, 43.6453], // Islington
  [-79.5130, 43.6490], // Royal York
  [-79.5000, 43.6496], // Old Mill
  [-79.4876, 43.6499], // Jane
  [-79.4762, 43.6519], // Runnymede
  [-79.4631, 43.6542], // High Park
  [-79.4498, 43.6560], // Keele
  [-79.4381, 43.6566], // Dundas West
  [-79.4255, 43.6573], // Lansdowne
  [-79.4128, 43.6582], // Dufferin
  [-79.4024, 43.6620], // Ossington
  [-79.4133, 43.6646], // Christie
  [-79.4112, 43.6665], // Bathurst
  [-79.4036, 43.6673], // Spadina (interchange with Line 1)
  [-79.3997, 43.6680], // St George (interchange with Line 1)
  [-79.3857, 43.6710], // Bloor-Yonge (major interchange)
  [-79.3770, 43.6714], // Sherbourne
  [-79.3674, 43.6724], // Castle Frank
  [-79.3601, 43.6715], // Broadview
  [-79.3527, 43.6714], // Chester
  [-79.3444, 43.6716], // Pape
  [-79.3388, 43.6729], // Donlands
  [-79.3295, 43.6789], // Greenwood
  [-79.3327, 43.6744], // Coxwell
  [-79.3177, 43.6851], // Woodbine
  [-79.3040, 43.6879], // Main Street
  [-79.3101, 43.6964], // Victoria Park
  [-79.3025, 43.7138], // Warden
  [-79.2636, 43.7316], // Kennedy
];

// ─── Line 4 — Sheppard ────────────────────────────────────────────────────────
//
// Short east-west stub along Sheppard Ave East.
// Sheppard-Yonge → Don Mills.
//
const LINE4_PATH: LngLat[] = [
  [-79.4106, 43.7615], // Sheppard-Yonge (interchange with Line 1)
  [-79.3878, 43.7607], // Bayview
  [-79.3697, 43.7607], // Bessarion
  [-79.3450, 43.7715], // Leslie
  [-79.3310, 43.7748], // Don Mills
];

// ─── Exports ──────────────────────────────────────────────────────────────────

export const SUBWAY_LINES: SubwayLine[] = [
  { id: 'line1', name: 'Line 1 (Yonge-University)', routeId: '1', path: LINE1_PATH },
  { id: 'line2', name: 'Line 2 (Bloor-Danforth)',   routeId: '2', path: LINE2_PATH },
  { id: 'line4', name: 'Line 4 (Sheppard)',          routeId: '4', path: LINE4_PATH },
];
