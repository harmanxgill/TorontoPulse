/**
 * Central state store for Toronto Pulse.
 * Simple reactive store — no framework needed.
 */

import type { PulseEvent, EventCategory, LayerConfig, DataSource } from './adapters/types';

export const LAYER_CONFIGS: LayerConfig[] = [
  {
    id: 'ttc',
    label: 'TTC Delays',
    icon: '🚇',
    color: [255, 80, 80],
    enabled: true,
    description: 'Real-time subway & bus delay incidents across the TTC network',
  },
  {
    id: '311',
    label: '311 Complaints',
    icon: '📞',
    color: [255, 165, 0],
    enabled: true,
    description: 'Resident service requests: noise, graffiti, potholes, bylaw violations',
  },
  {
    id: 'traffic',
    label: 'Road Closures',
    icon: '🚧',
    color: [255, 100, 30],
    enabled: true,
    description: 'Active road closures, construction blockages, and traffic incidents',
  },
  {
    id: 'airquality',
    label: 'Air Quality',
    icon: '💨',
    color: [100, 200, 255],
    enabled: true,
    description: 'Air Quality Health Index (AQHI) readings from monitoring stations',
  },
  {
    id: 'restaurant',
    label: 'DineSafe',
    icon: '🍽️',
    color: [100, 220, 100],
    enabled: false,
    description: 'DineSafe health inspection results: Pass, Conditional, Fail',
  },
  {
    id: 'shelter',
    label: 'Shelter Capacity',
    icon: '🏠',
    color: [180, 120, 255],
    enabled: false,
    description: 'Overnight shelter and warming centre bed availability tonight',
  },
  {
    id: 'construction',
    label: 'Construction',
    icon: '🏗️',
    color: [255, 200, 0],
    enabled: false,
    description: 'Active building permits and major construction sites',
  },
  {
    id: 'crime',
    label: 'Crime Incidents',
    icon: '🔴',
    color: [200, 50, 50],
    enabled: false,
    description: 'Major crime indicators from Toronto Police — last 90 days',
  },
];

export interface AppState {
  events: PulseEvent[];
  layers: LayerConfig[];
  dataSources: DataSource[];
  selectedEvent: PulseEvent | null;
  hoveredEvent: PulseEvent | null;
  timeRange: number; // hours to look back
  loading: boolean;
  lastRefresh: number;
}

type Listener = (state: AppState) => void;

class Store {
  private state: AppState = {
    events: [],
    layers: LAYER_CONFIGS.map(l => ({ ...l })),
    dataSources: [],
    selectedEvent: null,
    hoveredEvent: null,
    timeRange: 24,
    loading: false,
    lastRefresh: 0,
  };

  private listeners = new Set<Listener>();

  getState(): AppState {
    return this.state;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.listeners.forEach(l => l(this.state));
  }

  setState(patch: Partial<AppState>) {
    this.state = { ...this.state, ...patch };
    this.notify();
  }

  addEvents(events: PulseEvent[]) {
    const existingIds = new Set(this.state.events.map(e => e.id));
    const newEvents = events.filter(e => !existingIds.has(e.id));
    this.state = {
      ...this.state,
      events: [...this.state.events, ...newEvents],
    };
    this.notify();
  }

  setEvents(events: PulseEvent[]) {
    this.state = { ...this.state, events };
    this.notify();
  }

  toggleLayer(id: EventCategory) {
    this.state = {
      ...this.state,
      layers: this.state.layers.map(l =>
        l.id === id ? { ...l, enabled: !l.enabled } : l
      ),
    };
    this.notify();
  }

  setSelectedEvent(event: PulseEvent | null) {
    this.state = { ...this.state, selectedEvent: event };
    this.notify();
  }

  setHoveredEvent(event: PulseEvent | null) {
    this.state = { ...this.state, hoveredEvent: event };
    this.notify();
  }

  setDataSource(source: DataSource) {
    const existing = this.state.dataSources.findIndex(d => d.id === source.id);
    const updated = existing >= 0
      ? this.state.dataSources.map((d, i) => i === existing ? source : d)
      : [...this.state.dataSources, source];
    this.state = { ...this.state, dataSources: updated };
    this.notify();
  }

  getVisibleEvents(): PulseEvent[] {
    const enabledLayers = new Set(
      this.state.layers.filter(l => l.enabled).map(l => l.id)
    );
    const cutoff = Date.now() - this.state.timeRange * 60 * 60 * 1000;
    return this.state.events.filter(
      e => enabledLayers.has(e.category) && e.timestamp >= cutoff
    );
  }

  getLayerConfig(id: EventCategory): LayerConfig | undefined {
    return this.state.layers.find(l => l.id === id);
  }
}

export const store = new Store();
