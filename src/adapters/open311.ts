/**
 * 311 Service Requests
 * Source: Toronto Open Data
 *
 * NOTE: The 311 dataset is published as annual ZIP/CSV files only.
 * There is no datastore API or CORS-accessible JSON endpoint.
 * This adapter returns an empty array. The layer is disabled in the store.
 */

import type { PulseEvent } from './types';

export async function fetch311Complaints(): Promise<PulseEvent[]> {
  return [];
}
