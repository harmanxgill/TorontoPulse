export type EventCategory =
  | 'ttc'
  | '311'
  | 'restaurant'
  | 'construction'
  | 'airquality'
  | 'crime'
  | 'shelter'
  | 'traffic';

export type Severity = 'low' | 'medium' | 'high' | 'critical';

export interface PulseEvent {
  id: string;
  lat: number;
  lng: number;
  category: EventCategory;
  severity: Severity;
  timestamp: number; // unix ms
  title: string;
  description?: string;
  metadata?: Record<string, string | number | boolean>;
}

export interface NeighbourhoodScore {
  name: string;
  lat: number;
  lng: number;
  transit: number;       // 0-100
  noise: number;         // 0-100
  airQuality: number;    // 0-100
  safety: number;        // 0-100
  overall: number;       // 0-100
  eventCounts: Partial<Record<EventCategory, number>>;
}

export interface LayerConfig {
  id: EventCategory;
  label: string;
  icon: string;
  color: [number, number, number];
  enabled: boolean;
  description: string;
}

export type AdapterStatus = 'idle' | 'loading' | 'ok' | 'error';

export interface DataSource {
  id: string;
  label: string;
  status: AdapterStatus;
  lastFetched?: number;
  count?: number;
}
