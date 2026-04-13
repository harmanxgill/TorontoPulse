/**
 * Map engine — MapLibre GL base map + deck.gl overlay
 *
 * deck.gl canvas has pointer-events:none so MapLibre handles all mouse
 * interactions. We manually call deck.pickObject() / deck.pickMultipleObjects()
 * from MapLibre event handlers to get hover and click picking.
 */

import maplibregl, { type MapMouseEvent } from 'maplibre-gl';
import { Deck } from '@deck.gl/core';
import type { Layer } from '@deck.gl/core';
import { store } from './store';
import { buildLayers } from './layers';

const TORONTO_CENTER: [number, number] = [-79.3832, 43.6532];
const DEFAULT_ZOOM = 12;

const MAP_STYLE = {
  version: 8,
  sources: {
    'carto-dark': {
      type: 'raster',
      tiles: [
        'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
        'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
        'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
      ],
      tileSize: 256,
      attribution: '© <a href="https://carto.com/">Carto</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxzoom: 19,
    },
  },
  layers: [
    {
      id: 'carto-dark-layer',
      type: 'raster',
      source: 'carto-dark',
      minzoom: 0,
      maxzoom: 22,
    },
  ],
};

let mapInstance: maplibregl.Map | null = null;
let deckInstance: Deck | null = null;

export function initMap(
  container: HTMLElement,
  onEventClick: (event: unknown | null, lngLat?: { lat: number; lng: number }) => void,
  onEventHover: (event: unknown | null) => void,
): { map: maplibregl.Map; deck: Deck } {
  const map = new maplibregl.Map({
    container,
    style: MAP_STYLE as maplibregl.StyleSpecification,
    center: TORONTO_CENTER,
    zoom: DEFAULT_ZOOM,
    bearing: 0,
    pitch: 0,
    attributionControl: false,
  });

  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
  map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');

  const deck = new Deck({
    canvas: 'deck-canvas',
    width: '100%',
    height: '100%',
    initialViewState: {
      longitude: TORONTO_CENTER[0],
      latitude: TORONTO_CENTER[1],
      zoom: DEFAULT_ZOOM,
      pitch: 0,
      bearing: 0,
    },
    controller: false,
    layers: [],
    // No onClick/onHover here — we drive picking from MapLibre events below
  });

  // Sync deck camera with MapLibre on every frame
  map.on('move', () => {
    const { lng, lat } = map.getCenter();
    deck.setProps({
      viewState: {
        longitude: lng,
        latitude: lat,
        zoom: map.getZoom(),
        bearing: map.getBearing(),
        pitch: map.getPitch(),
      },
    });
  });

  // Manual picking: translate MapLibre pixel coords → deck pickObject
  function deckPick(e: MapMouseEvent) {
    return deck.pickObject({
      x: e.point.x,
      y: e.point.y,
      radius: 8,
    });
  }

  map.on('mousemove', (e: MapMouseEvent) => {
    const picked = deckPick(e);
    const obj = picked?.object ?? null;
    onEventHover(obj);
    map.getCanvas().style.cursor = obj ? 'pointer' : '';
  });

  map.on('click', (e: MapMouseEvent) => {
    const picked = deckPick(e);
    if (picked?.object) {
      onEventClick(picked.object);
    } else {
      onEventClick(null, { lat: e.lngLat.lat, lng: e.lngLat.lng });
    }
  });

  mapInstance = map;
  deckInstance = deck;

  store.subscribe(() => {
    if (!deckInstance) return;
    deckInstance.setProps({ layers: buildLayers() });
  });

  return { map, deck };
}

export function getMap() { return mapInstance; }
export function getDeck() { return deckInstance; }

export function flyTo(lng: number, lat: number, zoom = 15) {
  mapInstance?.flyTo({ center: [lng, lat], zoom, duration: 800 });
}

export function refreshLayers() {
  if (!deckInstance) return;
  deckInstance.setProps({ layers: buildLayers() as Layer[] });
}
