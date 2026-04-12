/**
 * deck.gl layer factory
 * Each category gets its own visual treatment.
 */

import { ScatterplotLayer } from '@deck.gl/layers';
import { HeatmapLayer } from '@deck.gl/aggregation-layers';
import type { Layer } from '@deck.gl/core';
import { store } from '../store';
import type { PulseEvent } from '../adapters/types';

const SEVERITY_ALPHA: Record<string, number> = {
  low: 160,
  medium: 200,
  high: 230,
  critical: 255,
};

const SEVERITY_RADIUS: Record<string, number> = {
  low: 60,
  medium: 90,
  high: 130,
  critical: 180,
};

// Color palettes per category
const CATEGORY_COLORS: Record<string, Record<string, [number, number, number]>> = {
  ttc: {
    low: [50, 150, 255],
    medium: [50, 100, 255],
    high: [255, 80, 80],
    critical: [255, 30, 30],
  },
  '311': {
    low: [255, 200, 50],
    medium: [255, 160, 30],
    high: [255, 100, 30],
    critical: [255, 50, 50],
  },
  restaurant: {
    low: [50, 220, 120],
    medium: [255, 200, 0],
    high: [255, 120, 0],
    critical: [255, 50, 50],
  },
  construction: {
    low: [200, 160, 50],
    medium: [220, 180, 30],
    high: [255, 200, 0],
    critical: [255, 220, 0],
  },
  airquality: {
    low: [100, 220, 255],
    medium: [255, 220, 100],
    high: [255, 140, 50],
    critical: [255, 50, 50],
  },
  traffic: {
    low: [255, 150, 50],
    medium: [255, 100, 30],
    high: [255, 60, 20],
    critical: [255, 30, 0],
  },
  shelter: {
    low: [180, 130, 255],
    medium: [200, 100, 255],
    high: [220, 70, 255],
    critical: [255, 50, 200],
  },
  crime: {
    low: [180, 80, 80],
    medium: [210, 60, 60],
    high: [240, 40, 40],
    critical: [255, 20, 20],
  },
};

function getColor(event: PulseEvent): [number, number, number, number] {
  const palette = CATEGORY_COLORS[event.category] ?? CATEGORY_COLORS['311'];
  const rgb = palette[event.severity] ?? [200, 200, 200];
  return [...rgb, SEVERITY_ALPHA[event.severity] ?? 200] as [number, number, number, number];
}

function getRadius(event: PulseEvent): number {
  return SEVERITY_RADIUS[event.severity] ?? 80;
}

export function buildLayers(): Layer[] {
  const state = store.getState();
  const visibleEvents = store.getVisibleEvents();
  const selected = state.selectedEvent;
  const hovered = state.hoveredEvent;

  const layers: Layer[] = [];

  // Group events by category for layer-specific rendering
  const byCategory = new Map<string, PulseEvent[]>();
  for (const event of visibleEvents) {
    const group = byCategory.get(event.category) ?? [];
    group.push(event);
    byCategory.set(event.category, group);
  }

  // --- 311 Complaints: Heatmap + scatter ---
  const complaints = byCategory.get('311') ?? [];
  if (complaints.length > 0) {
    layers.push(
      new HeatmapLayer({
        id: '311-heatmap',
        data: complaints,
        getPosition: (d: PulseEvent) => [d.lng, d.lat],
        getWeight: (d: PulseEvent) => d.severity === 'critical' ? 4 : d.severity === 'high' ? 3 : d.severity === 'medium' ? 2 : 1,
        radiusPixels: 40,
        intensity: 1.2,
        threshold: 0.05,
        colorRange: [
          [50, 50, 200, 0],
          [100, 100, 255, 100],
          [255, 200, 0, 180],
          [255, 140, 0, 210],
          [255, 80, 0, 230],
          [255, 30, 30, 255],
        ],
        pickable: false,
        opacity: 0.6,
      })
    );
  }

  // --- TTC Delays: Pulsing scatter circles ---
  const ttcEvents = byCategory.get('ttc') ?? [];
  layers.push(
    new ScatterplotLayer({
      id: 'ttc-delays',
      data: ttcEvents,
      getPosition: (d: PulseEvent) => [d.lng, d.lat],
      getRadius: (d: PulseEvent) => getRadius(d) * 1.5,
      getFillColor: (d: PulseEvent) => getColor(d),
      getLineColor: (d: PulseEvent) => {
        const c = getColor(d);
        return [Math.min(c[0] + 40, 255), Math.min(c[1] + 40, 255), Math.min(c[2] + 40, 255), 255];
      },
      lineWidthMinPixels: 1.5,
      stroked: true,
      filled: true,
      radiusMinPixels: 6,
      radiusMaxPixels: 25,
      pickable: true,
      autoHighlight: true,
      highlightColor: [255, 255, 255, 60],
      opacity: 0.9,
    })
  );

  // --- Restaurant Inspections: Colored dots ---
  const restaurants = byCategory.get('restaurant') ?? [];
  layers.push(
    new ScatterplotLayer({
      id: 'restaurants',
      data: restaurants,
      getPosition: (d: PulseEvent) => [d.lng, d.lat],
      getRadius: 40,
      getFillColor: (d: PulseEvent) => getColor(d),
      radiusMinPixels: 4,
      radiusMaxPixels: 12,
      pickable: true,
      autoHighlight: true,
      highlightColor: [255, 255, 255, 60],
      opacity: 0.85,
    })
  );

  // --- Construction: Squares via ScatterplotLayer ---
  const construction = byCategory.get('construction') ?? [];
  layers.push(
    new ScatterplotLayer({
      id: 'construction',
      data: construction,
      getPosition: (d: PulseEvent) => [d.lng, d.lat],
      getRadius: (d: PulseEvent) => getRadius(d) * 0.8,
      getFillColor: (d: PulseEvent) => getColor(d),
      getLineColor: [255, 220, 0, 200],
      stroked: true,
      lineWidthMinPixels: 1,
      radiusMinPixels: 5,
      radiusMaxPixels: 16,
      pickable: true,
      autoHighlight: true,
      highlightColor: [255, 255, 255, 60],
      opacity: 0.8,
    })
  );

  // --- Air Quality: Large translucent bubbles ---
  const airQuality = byCategory.get('airquality') ?? [];
  layers.push(
    new ScatterplotLayer({
      id: 'airquality',
      data: airQuality,
      getPosition: (d: PulseEvent) => [d.lng, d.lat],
      getRadius: 1200,
      getFillColor: (d: PulseEvent) => {
        const c = getColor(d);
        return [c[0], c[1], c[2], 50];
      },
      getLineColor: (d: PulseEvent) => {
        const c = getColor(d);
        return [c[0], c[1], c[2], 180];
      },
      stroked: true,
      lineWidthMinPixels: 1.5,
      radiusMinPixels: 30,
      radiusMaxPixels: 80,
      pickable: true,
      autoHighlight: true,
      highlightColor: [255, 255, 255, 30],
    })
  );

  // --- 311 complaints as scatter on top of heatmap for interaction ---
  layers.push(
    new ScatterplotLayer({
      id: '311-scatter',
      data: complaints,
      getPosition: (d: PulseEvent) => [d.lng, d.lat],
      getRadius: (d: PulseEvent) => getRadius(d) * 0.6,
      getFillColor: (d: PulseEvent) => getColor(d),
      radiusMinPixels: 3,
      radiusMaxPixels: 12,
      pickable: true,
      autoHighlight: true,
      highlightColor: [255, 255, 255, 60],
      opacity: 0.7,
    })
  );

  // --- Traffic incidents ---
  const trafficEvents = byCategory.get('traffic') ?? [];
  layers.push(
    new ScatterplotLayer({
      id: 'traffic',
      data: trafficEvents,
      getPosition: (d: PulseEvent) => [d.lng, d.lat],
      getRadius: (d: PulseEvent) => getRadius(d),
      getFillColor: (d: PulseEvent) => getColor(d),
      getLineColor: [255, 120, 30, 200],
      stroked: true,
      lineWidthMinPixels: 1.5,
      radiusMinPixels: 6,
      radiusMaxPixels: 20,
      pickable: true,
      autoHighlight: true,
      highlightColor: [255, 255, 255, 60],
      opacity: 0.9,
    })
  );

  // --- Shelter capacity ---
  const shelterEvents = byCategory.get('shelter') ?? [];
  layers.push(
    new ScatterplotLayer({
      id: 'shelter',
      data: shelterEvents,
      getPosition: (d: PulseEvent) => [d.lng, d.lat],
      getRadius: 120,
      getFillColor: (d: PulseEvent) => getColor(d),
      getLineColor: [200, 150, 255, 200],
      stroked: true,
      lineWidthMinPixels: 2,
      radiusMinPixels: 8,
      radiusMaxPixels: 22,
      pickable: true,
      autoHighlight: true,
      highlightColor: [255, 255, 255, 60],
      opacity: 0.9,
    })
  );

  // --- Crime heatmap ---
  const crimeEvents = byCategory.get('crime') ?? [];
  if (crimeEvents.length > 0) {
    layers.push(
      new HeatmapLayer({
        id: 'crime-heatmap',
        data: crimeEvents,
        getPosition: (d: PulseEvent) => [d.lng, d.lat],
        getWeight: (d: PulseEvent) => d.severity === 'critical' ? 4 : d.severity === 'high' ? 3 : 2,
        radiusPixels: 35,
        intensity: 1.0,
        threshold: 0.05,
        colorRange: [
          [50, 0, 0, 0],
          [100, 20, 20, 80],
          [180, 40, 40, 150],
          [220, 60, 60, 200],
          [255, 80, 80, 230],
          [255, 30, 30, 255],
        ],
        pickable: false,
        opacity: 0.55,
      })
    );
    layers.push(
      new ScatterplotLayer({
        id: 'crime-scatter',
        data: crimeEvents,
        getPosition: (d: PulseEvent) => [d.lng, d.lat],
        getRadius: 50,
        getFillColor: (d: PulseEvent) => getColor(d),
        radiusMinPixels: 3,
        radiusMaxPixels: 10,
        pickable: true,
        autoHighlight: true,
        highlightColor: [255, 255, 255, 60],
        opacity: 0.65,
      })
    );
  }

  // --- Selected event highlight ring ---
  if (selected) {
    layers.push(
      new ScatterplotLayer({
        id: 'selected-event',
        data: [selected],
        getPosition: (d: PulseEvent) => [d.lng, d.lat],
        getRadius: 200,
        getFillColor: [255, 255, 255, 0],
        getLineColor: [255, 255, 255, 255],
        stroked: true,
        filled: false,
        lineWidthMinPixels: 2.5,
        radiusMinPixels: 20,
        radiusMaxPixels: 40,
        pickable: false,
      })
    );
  }

  // --- Hovered event pulse ring ---
  if (hovered && hovered !== selected) {
    layers.push(
      new ScatterplotLayer({
        id: 'hovered-event',
        data: [hovered],
        getPosition: (d: PulseEvent) => [d.lng, d.lat],
        getRadius: 160,
        getFillColor: [255, 255, 255, 0],
        getLineColor: [255, 255, 255, 180],
        stroked: true,
        filled: false,
        lineWidthMinPixels: 1.5,
        radiusMinPixels: 16,
        radiusMaxPixels: 32,
        pickable: false,
      })
    );
  }

  return layers;
}
