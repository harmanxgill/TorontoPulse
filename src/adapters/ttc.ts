/**
 * TTC Subway Delay Data
 * Source: Toronto Open Data
 * Resource: 6088e14f-e46e-4f5c-9daa-dea1359ad396 (TTC Subway Delay Data)
 * Codes:    9e9efbb6-3a2f-4934-ac94-9150ecaeb548 (TTC Subway Delay Codes)
 * Fields: Date, Time, Day, Station, Code, Min Delay, Min Gap, Bound, Line, Vehicle
 */

import type { PulseEvent, Severity } from './types';
import { TORONTO_BASE } from './config';

const BASE = `${TORONTO_BASE}/api/3/action/datastore_search`;
const RESOURCE_ID  = '6088e14f-e46e-4f5c-9daa-dea1359ad396';
const CODES_RESOURCE = '9e9efbb6-3a2f-4934-ac94-9150ecaeb548';

// Verified station coordinates (WGS84)
const STATION_COORDS: Record<string, [number, number]> = {
  'UNION':          [43.6452, -79.3806],
  'BLOOR':          [43.6710, -79.3857],
  'BLOOR-YONGE':    [43.6710, -79.3857],
  'SHEPPARD':       [43.7615, -79.4106],
  'SHEPPARD-YONGE': [43.7615, -79.4106],
  'FINCH':          [43.7800, -79.4147],
  'FINCH WEST':     [43.7760, -79.5440],
  'SPADINA':        [43.6673, -79.4036],
  'ST GEORGE':      [43.6680, -79.3997],
  "ST. GEORGE":     [43.6680, -79.3997],
  'KING':           [43.6489, -79.3774],
  'QUEEN':          [43.6524, -79.3797],
  'DUNDAS':         [43.6556, -79.3800],
  'COLLEGE':        [43.6601, -79.3813],
  'WELLESLEY':      [43.6651, -79.3827],
  'MUSEUM':         [43.6672, -79.3944],
  'BAY':            [43.6702, -79.3899],
  'ROSEDALE':       [43.6764, -79.3829],
  'SUMMERHILL':     [43.6818, -79.3849],
  'EGLINTON':       [43.7071, -79.3983],
  'LAWRENCE':       [43.7262, -79.4040],
  'YORK MILLS':     [43.7452, -79.4074],
  'DOWNSVIEW PARK': [43.7520, -79.4786],
  'KIPLING':        [43.6365, -79.5359],
  'ISLINGTON':      [43.6453, -79.5239],
  'ROYAL YORK':     [43.6490, -79.5130],
  'OLD MILL':       [43.6496, -79.5000],
  'JANE':           [43.6499, -79.4876],
  'RUNNYMEDE':      [43.6519, -79.4762],
  'HIGH PARK':      [43.6542, -79.4631],
  'KEELE':          [43.6560, -79.4498],
  'DUNDAS WEST':    [43.6566, -79.4381],
  'LANSDOWNE':      [43.6573, -79.4255],
  'DUFFERIN':       [43.6582, -79.4128],
  'OSSINGTON':      [43.6620, -79.4024],
  'CHRISTIE':       [43.6646, -79.4133],
  'BATHURST':       [43.6665, -79.4112],
  'DUPONT':         [43.6745, -79.4083],
  'ST CLAIR WEST':  [43.6826, -79.4145],
  'GLENCAIRN':      [43.7126, -79.4348],
  'LAWRENCE WEST':  [43.7266, -79.4489],
  'YORKDALE':       [43.7243, -79.4530],
  'WILSON':         [43.7337, -79.4604],
  'PIONEER VILLAGE':[43.7738, -79.5015],
  'HIGHWAY 407':    [43.7818, -79.5338],
  'VAUGHAN':        [43.7950, -79.5385],
  'KENNEDY':        [43.7316, -79.2636],
  'WARDEN':         [43.7138, -79.3025],
  'VICTORIA PARK':  [43.6964, -79.3101],
  'MAIN STREET':    [43.6879, -79.3040],
  'WOODBINE':       [43.6851, -79.3177],
  'GREENWOOD':      [43.6789, -79.3295],
  'COXWELL':        [43.6744, -79.3327],
  'DONLANDS':       [43.6729, -79.3388],
  'PAPE':           [43.6716, -79.3444],
  'CHESTER':        [43.6714, -79.3527],
  'BROADVIEW':      [43.6715, -79.3601],
  'CASTLE FRANK':   [43.6724, -79.3674],
  'SHERBOURNE':     [43.6714, -79.3770],
  'ST CLAIR':       [43.6881, -79.3916],
  'DAVISVILLE':     [43.6981, -79.3974],
};

const LINE_NAMES: Record<string, string> = {
  'YU':  'Line 1 (Yonge-University)',
  'BD':  'Line 2 (Bloor-Danforth)',
  'SHP': 'Line 4 (Sheppard)',
  'SRT': 'Line 3 (Scarborough RT)',
  'YUS': 'Line 1 (Yonge-University)',
  'YU/BD': 'Lines 1 & 2',
  'BD/YU': 'Lines 1 & 2',
};

const BOUND_NAMES: Record<string, string> = {
  'N': 'Northbound',
  'S': 'Southbound',
  'E': 'Eastbound',
  'W': 'Westbound',
  'B': 'Both directions',
};

// Cached delay code descriptions fetched from Toronto Open Data
let codeDescriptions: Map<string, string> | null = null;
let codesPromise: Promise<Map<string, string>> | null = null;

async function loadCodeDescriptions(): Promise<Map<string, string>> {
  if (codeDescriptions) return codeDescriptions;
  if (codesPromise) return codesPromise;

  codesPromise = (async () => {
    const map = new Map<string, string>();
    try {
      const url = `${BASE}?resource_id=${CODES_RESOURCE}&limit=500`;
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (res.ok) {
        const data = await res.json();
        const records: Record<string, string>[] = data?.result?.records ?? [];
        for (const r of records) {
          const code = String(r['CODE'] ?? r['Code'] ?? '').trim();
          const desc = String(r['DESCRIPTION'] ?? r['Description'] ?? '').trim();
          if (code && desc) map.set(code, desc);
        }
      }
    } catch {
      // Codes unavailable — will fall back to raw code strings
    }
    codeDescriptions = map;
    return map;
  })();

  return codesPromise;
}

function resolveCoords(stationName: string): [number, number] | null {
  if (!stationName) return null;
  const upper = stationName.toUpperCase().trim();
  if (STATION_COORDS[upper]) return STATION_COORDS[upper];
  for (const [key, coords] of Object.entries(STATION_COORDS)) {
    if (upper.startsWith(key) || key.startsWith(upper)) return coords;
  }
  return null;
}

function delaySeverity(minutes: number): Severity {
  if (minutes >= 20) return 'critical';
  if (minutes >= 10) return 'high';
  if (minutes >= 5)  return 'medium';
  return 'low';
}

function toTitleCase(str: string): string {
  return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

export async function fetchTTCDelays(): Promise<PulseEvent[]> {
  const [delayData, codes] = await Promise.all([
    fetch(`${BASE}?resource_id=${RESOURCE_ID}&limit=300&sort=Date desc,Time desc`, {
      signal: AbortSignal.timeout(10000),
    }),
    loadCodeDescriptions(),
  ]);

  if (!delayData.ok) return [];

  const data = await delayData.json();
  const records: Record<string, string>[] = data?.result?.records ?? [];
  if (records.length === 0) return [];

  const now = Date.now();

  return records
    .filter(r => {
      // Must have a known station
      if (!resolveCoords(r['Station'] ?? '')) return false;
      // Skip non-delay records (0 min delay and 0 min gap = informational only)
      const delay = parseInt(r['Min Delay'] ?? '0') || 0;
      if (delay === 0) return false;
      return true;
    })
    .map((row, i): PulseEvent => {
      const coords = resolveCoords(row['Station'])!;
      const delayMin = parseInt(row['Min Delay'] ?? '0') || 0;
      const gapMin   = parseInt(row['Min Gap']   ?? '0') || 0;
      const rawCode  = (row['Code'] ?? '').trim();
      const rawLine  = (row['Line'] ?? '').trim().toUpperCase();
      const rawBound = (row['Bound'] ?? '').trim().toUpperCase();

      const codeDesc = codes.get(rawCode);
      const lineName = LINE_NAMES[rawLine] ?? `Line ${rawLine}`;
      const boundName = BOUND_NAMES[rawBound] ?? rawBound;

      // Title: human-readable description + station
      const titleDesc = codeDesc
        ? toTitleCase(codeDesc)
        : (rawCode || 'Delay');
      const stationName = toTitleCase(row['Station'] ?? 'Unknown');
      const title = `${titleDesc} — ${stationName}`;

      // Description: line, direction, delay, gap
      const parts: string[] = [lineName];
      if (boundName) parts.push(boundName);
      parts.push(`${delayMin} min delay`);
      if (gapMin > 0) parts.push(`${gapMin} min gap`);

      return {
        id: `ttc-${row['_id'] ?? i}-${now}`,
        lat: coords[0],
        lng: coords[1],
        category: 'ttc',
        severity: delaySeverity(delayMin),
        timestamp: now,
        title,
        description: parts.join(' · '),
        metadata: {
          station:      toTitleCase(row['Station'] ?? ''),
          line:         lineName,
          bound:        boundName || rawBound,
          delayMinutes: delayMin,
          gapMinutes:   gapMin,
          code:         rawCode,
          codeDescription: codeDesc ?? rawCode,
          vehicle:      row['Vehicle'] ?? '',
        },
      };
    });
}
