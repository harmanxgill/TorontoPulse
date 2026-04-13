/**
 * 311 Service Requests
 * Source: City of Toronto Open Data — annual ZIP/CSV
 *   https://open.toronto.ca/dataset/311-service-requests-customer-initiated/
 *
 * The real-time Open311 GeoReport API (secure.toronto.ca) returns 403.
 * The CKAN dataset has no datastore API — only annual ZIP/CSV files.
 * This adapter downloads the current year's ZIP (~2MB), unzips it client-side,
 * parses the CSV, maps FSA codes to approximate centroids, and returns PulseEvents.
 *
 * The data is refreshed monthly by the city. Module-level caching prevents
 * re-downloading on every 5-minute refresh cycle.
 */

import { unzipSync } from 'fflate';
import type { PulseEvent, Severity } from './types';

// ─── FSA → approximate centroid (lat, lng) ────────────────────────────────────
// 100 active Toronto FSAs. Centroids are accurate to ~500m — suitable for heatmap.
const FSA_CENTROIDS: Record<string, [number, number]> = {
  // M1* — Scarborough East
  M1B: [43.807, -79.254], M1C: [43.786, -79.218], M1E: [43.764, -79.225],
  M1G: [43.770, -79.220], M1H: [43.772, -79.234], M1J: [43.747, -79.222],
  M1K: [43.728, -79.265], M1L: [43.710, -79.290], M1M: [43.723, -79.238],
  M1N: [43.693, -79.270], M1P: [43.758, -79.280], M1R: [43.751, -79.307],
  M1S: [43.793, -79.283], M1T: [43.787, -79.324], M1V: [43.815, -79.313],
  M1W: [43.800, -79.355], M1X: [43.839, -79.229],

  // M2* — North York East/Central
  M2H: [43.803, -79.363], M2J: [43.776, -79.342], M2K: [43.764, -79.376],
  M2L: [43.746, -79.396], M2M: [43.793, -79.415], M2N: [43.769, -79.415],
  M2P: [43.752, -79.403], M2R: [43.790, -79.447],

  // M3* — North York North/West
  M3A: [43.753, -79.330], M3B: [43.745, -79.352], M3C: [43.726, -79.350],
  M3H: [43.762, -79.446], M3J: [43.769, -79.490], M3K: [43.740, -79.474],
  M3L: [43.746, -79.515], M3M: [43.727, -79.502], M3N: [43.747, -79.532],

  // M4* — East York / Downtown East
  M4A: [43.729, -79.304], M4B: [43.706, -79.309], M4C: [43.695, -79.328],
  M4E: [43.677, -79.296], M4G: [43.706, -79.362], M4H: [43.705, -79.353],
  M4J: [43.685, -79.340], M4K: [43.677, -79.352], M4L: [43.666, -79.328],
  M4M: [43.660, -79.351], M4N: [43.724, -79.388], M4P: [43.713, -79.386],
  M4R: [43.723, -79.401], M4S: [43.705, -79.386], M4T: [43.697, -79.392],
  M4V: [43.694, -79.406], M4W: [43.679, -79.383], M4X: [43.666, -79.370],
  M4Y: [43.669, -79.382],

  // M5* — Downtown Toronto / Midtown
  M5A: [43.657, -79.360], M5B: [43.657, -79.374], M5C: [43.651, -79.373],
  M5E: [43.644, -79.375], M5G: [43.657, -79.387], M5H: [43.649, -79.381],
  M5J: [43.641, -79.381], M5K: [43.630, -79.380], M5M: [43.733, -79.419],
  M5N: [43.721, -79.421], M5P: [43.697, -79.419], M5R: [43.674, -79.411],
  M5S: [43.661, -79.399], M5T: [43.652, -79.398], M5V: [43.641, -79.400],
  M5X: [43.648, -79.381],

  // M6* — West Toronto
  M6A: [43.722, -79.451], M6B: [43.710, -79.453], M6C: [43.694, -79.445],
  M6E: [43.684, -79.458], M6G: [43.666, -79.428], M6H: [43.659, -79.441],
  M6J: [43.648, -79.428], M6K: [43.638, -79.428], M6L: [43.713, -79.487],
  M6M: [43.691, -79.474], M6N: [43.665, -79.478], M6P: [43.658, -79.460],
  M6R: [43.649, -79.451], M6S: [43.651, -79.476],

  // M7* — Queen's Park / Government
  M7A: [43.664, -79.393],

  // M8* — South Etobicoke
  M8V: [43.617, -79.488], M8W: [43.605, -79.538], M8X: [43.647, -79.505],
  M8Y: [43.635, -79.499], M8Z: [43.624, -79.522],

  // M9* — Etobicoke West
  M9A: [43.665, -79.531], M9B: [43.647, -79.551], M9C: [43.643, -79.572],
  M9L: [43.756, -79.565], M9M: [43.725, -79.550], M9N: [43.708, -79.520],
  M9P: [43.683, -79.531], M9R: [43.688, -79.553], M9V: [43.746, -79.592],
  M9W: [43.707, -79.609],
};

// ─── Service type → severity + subcategory ────────────────────────────────────
interface ServiceRule {
  match: string;
  severity: Severity;
  subcategory: string;
}

const SERVICE_RULES: ServiceRule[] = [
  { match: 'noise',              severity: 'medium', subcategory: 'Noise'             },
  { match: 'illegal dump',       severity: 'high',   subcategory: 'Illegal Dumping'   },
  { match: 'graffiti',           severity: 'low',    subcategory: 'Graffiti'          },
  { match: 'property standard',  severity: 'medium', subcategory: 'Property Standards'},
  { match: 'maintenance violat', severity: 'medium', subcategory: 'Property Standards'},
  { match: 'garbage',            severity: 'medium', subcategory: 'Waste'             },
  { match: 'litter',             severity: 'low',    subcategory: 'Waste'             },
  { match: 'bin',                severity: 'low',    subcategory: 'Waste'             },
  { match: 'not picked up',      severity: 'medium', subcategory: 'Waste'             },
  { match: 'pothole',            severity: 'medium', subcategory: 'Roads'             },
  { match: 'road damage',        severity: 'medium', subcategory: 'Roads'             },
  { match: 'sidewalk',           severity: 'low',    subcategory: 'Roads'             },
  { match: 'plowing',            severity: 'low',    subcategory: 'Roads'             },
  { match: 'snow',               severity: 'low',    subcategory: 'Roads'             },
  { match: 'icy',                severity: 'medium', subcategory: 'Roads'             },
  { match: 'driveway blocked',   severity: 'medium', subcategory: 'Roads'             },
  { match: 'tree',               severity: 'low',    subcategory: 'Trees'             },
  { match: 'boulevard',          severity: 'low',    subcategory: 'Roads'             },
  { match: 'traffic signal',     severity: 'medium', subcategory: 'Infrastructure'    },
  { match: 'street light',       severity: 'low',    subcategory: 'Infrastructure'    },
  { match: 'catch basin',        severity: 'medium', subcategory: 'Drainage'          },
  { match: 'sewer',              severity: 'high',   subcategory: 'Drainage'          },
  { match: 'flooding',           severity: 'high',   subcategory: 'Drainage'          },
  { match: 'water',              severity: 'medium', subcategory: 'Water'             },
  { match: 'stray',              severity: 'medium', subcategory: 'Animal Services'   },
  { match: 'animal',             severity: 'medium', subcategory: 'Animal Services'   },
  { match: 'wildlife',           severity: 'medium', subcategory: 'Animal Services'   },
  { match: 'park',               severity: 'low',    subcategory: 'Parks'             },
];

const SEVERITY_ORDER: Severity[] = ['low', 'medium', 'high', 'critical'];

function bumpSeverity(s: Severity): Severity {
  return SEVERITY_ORDER[Math.min(SEVERITY_ORDER.indexOf(s) + 1, SEVERITY_ORDER.length - 1)];
}

function classify(serviceType: string, createdAt: Date): { severity: Severity; subcategory: string } {
  const lower = serviceType.toLowerCase();
  const rule = SERVICE_RULES.find(r => lower.includes(r.match));
  let severity: Severity = rule?.severity ?? 'low';
  const subcategory = rule?.subcategory ?? 'General';

  // Night-time modifier: 22:00–06:00 bumps severity one level.
  const h = createdAt.getHours();
  if (h >= 22 || h < 6) severity = bumpSeverity(severity);

  return { severity, subcategory };
}

// ─── Minimal CSV parser ───────────────────────────────────────────────────────
// Handles unquoted and double-quoted fields. Skips malformed lines.
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let i = 0;
  while (i < text.length) {
    const row: string[] = [];
    while (i < text.length && text[i] !== '\n') {
      if (text[i] === '"') {
        i++; // skip opening quote
        let field = '';
        while (i < text.length) {
          if (text[i] === '"' && text[i + 1] === '"') { field += '"'; i += 2; }
          else if (text[i] === '"') { i++; break; }
          else { field += text[i++]; }
        }
        row.push(field);
        if (text[i] === ',') i++;
      } else {
        let start = i;
        while (i < text.length && text[i] !== ',' && text[i] !== '\n') i++;
        row.push(text.slice(start, i));
        if (text[i] === ',') i++;
      }
    }
    if (text[i] === '\n') i++;
    if (row.length > 1) rows.push(row);
  }
  return rows;
}

// ─── Module-level cache — avoid re-downloading 2MB ZIP on every 5-min refresh ─
let _cached: PulseEvent[] | null = null;
let _cacheKey = '';

// ─── Deterministic jitter — spreads FSA centroid points across the FSA area ────
// ±0.010° ≈ ±1.1km. Keeps points within the FSA while avoiding large lake
// overshoots on southern waterfront FSAs. Uses sin-based PRNG for stable positions.
function jitter(val: number, seed: number): number {
  const x = Math.sin(seed * 127.1 + val * 311.7) * 43758.5453;
  return (x - Math.floor(x) - 0.5) * 0.020;
}

export async function fetch311Complaints(): Promise<PulseEvent[]> {
  const cacheKey = String(new Date().getFullYear());
  if (_cached && _cacheKey === cacheKey) return _cached;

  // ── Step 1: find the current-year resource ID from CKAN package metadata ──
  let zipUrl: string;
  try {
    const pkgRes = await fetch(
      '/toronto-api/api/3/action/package_show?id=311-service-requests-customer-initiated',
      { signal: AbortSignal.timeout(15_000) },
    );
    if (!pkgRes.ok) return [];
    const pkgData = await pkgRes.json();
    const resources: Array<{ name: string; url: string }> = pkgData?.result?.resources ?? [];
    const match = resources.find(r => r.name.includes(cacheKey));
    if (!match) return [];
    // Rewrite the absolute URL through our local CKAN proxy to avoid CORS.
    zipUrl = match.url.replace(
      'https://ckan0.cf.opendata.inter.prod-toronto.ca',
      '/toronto-api',
    );
  } catch {
    return [];
  }

  // ── Step 2: download and unzip ─────────────────────────────────────────────
  let csvText: string;
  try {
    const res = await fetch(zipUrl, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) return [];
    const buf = new Uint8Array(await res.arrayBuffer());
    const files = unzipSync(buf);
    const first = Object.values(files)[0];
    if (!first) return [];
    csvText = new TextDecoder('utf-8').decode(first);
  } catch {
    return [];
  }

  // ── Step 3: parse CSV ──────────────────────────────────────────────────────
  const rows = parseCSV(csvText);
  if (rows.length < 2) return [];

  // Header: Creation Date, Status, First 3 Chars of Postal Code,
  //         Intersection Street 1, Intersection Street 2, Ward,
  //         Service Request Type, Division, Section
  const HDR = rows[0];
  const COL = {
    date:    HDR.indexOf('Creation Date'),
    status:  HDR.indexOf('Status'),
    fsa:     HDR.indexOf('First 3 Chars of Postal Code'),
    type:    HDR.indexOf('Service Request Type'),
    ward:    HDR.indexOf('Ward'),
    section: HDR.indexOf('Section'),
  };

  const events: PulseEvent[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const fsa = row[COL.fsa]?.trim();
    if (!fsa || fsa === 'Intersection' || fsa.length !== 3) continue;

    const centroid = FSA_CENTROIDS[fsa];
    if (!centroid) continue;

    const dateStr = row[COL.date]?.trim();
    if (!dateStr) continue;
    const createdAt = new Date(dateStr);
    if (isNaN(createdAt.getTime())) continue;

    const serviceType = row[COL.type]?.trim() ?? 'Service Request';
    const { severity, subcategory } = classify(serviceType, createdAt);

    // Deterministic jitter so the same record always maps to the same spot.
    // If jitter pushes a point south of Toronto's shoreline (~43.63), fall back
    // to the centroid — better a cluster on land than a dot in Lake Ontario.
    const jLat = centroid[0] + jitter(centroid[0], i);
    const jLng = centroid[1] + jitter(centroid[1], i * 2);
    const lat = jLat < 43.63 ? centroid[0] : jLat;
    const lng = jLng;

    events.push({
      id: `311-${i}`,
      lat,
      lng,
      category: '311',
      severity,
      timestamp: createdAt.getTime(),
      title: serviceType,
      description: `${fsa} — ${row[COL.ward]?.trim() ?? ''}`,
      metadata: {
        subcategory,
        fsa,
        status: row[COL.status]?.trim() ?? '',
        ward: row[COL.ward]?.trim() ?? '',
        section: row[COL.section]?.trim() ?? '',
      },
    });
  }

  _cached = events;
  _cacheKey = cacheKey;
  return events;
}
