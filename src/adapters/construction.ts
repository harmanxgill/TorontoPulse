/**
 * Building Permits — Active Permits
 * Source: Toronto Open Data
 * Resource: 6d0229af-bc54-46de-9c2b-26759b01dd05
 *
 * NOTE: The active permits dataset contains no latitude/longitude fields.
 * Coordinates require joining against a separate spatial dataset via GEO_ID.
 * This adapter returns an empty array until a coordinate source is available.
 */

import type { PulseEvent } from './types';

export async function fetchConstruction(): Promise<PulseEvent[]> {
  return [];
}
