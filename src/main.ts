/**
 * Toronto Pulse — main entry point
 * Real-time urban intelligence dashboard for Toronto
 */

import './style.css';
import 'maplibre-gl/dist/maplibre-gl.css';

import { initMap } from './map';
import { store } from './store';
import {
  buildSidebar,
  renderLayerToggles,
  renderDataSources,
  updateStats,
  updateRefreshTime,
} from './ui/sidebar';
import {
  buildEventPanel,
  renderEventPanel,
  buildNeighbourhoodCard,
  computeNeighbourhoodPulse,
} from './ui/eventPanel';
import {
  fetchTTCDelays,
  fetch311Complaints,
  fetchRestaurantInspections,
  fetchConstruction,
  fetchAirQuality,
  fetchTrafficIncidents,
  fetchShelterCapacity,
  fetchCrimeIncidents,
} from './adapters';
import type { PulseEvent, EventCategory } from './adapters/types';

// ─── Build DOM ───────────────────────────────────────────────────────────────

const app = document.getElementById('app')!;

// Loading overlay
const loadingOverlay = document.createElement('div');
loadingOverlay.id = 'loading-overlay';
loadingOverlay.innerHTML = `
  <div class="loading-logo">Toronto<span>Pulse</span></div>
  <div class="loading-bar-wrap"><div class="loading-bar" id="loading-bar"></div></div>
  <div class="loading-status" id="loading-status">Initialising...</div>
`;
app.appendChild(loadingOverlay);

// Sidebar
const sidebar = buildSidebar();
app.appendChild(sidebar);

// Map container
const mapContainer = document.createElement('div');
mapContainer.id = 'map-container';

const mapCanvas = document.createElement('div');
mapCanvas.id = 'map-canvas';
mapContainer.appendChild(mapCanvas);

const deckCanvas = document.createElement('canvas');
deckCanvas.id = 'deck-canvas';
mapContainer.appendChild(deckCanvas);

app.appendChild(mapContainer);

// Event panel
const eventPanel = buildEventPanel();
app.appendChild(eventPanel);

// Neighbourhood card
const neighbourhoodCard = buildNeighbourhoodCard();
app.appendChild(neighbourhoodCard);

// Tooltip
const tooltip = document.createElement('div');
tooltip.id = 'tooltip';
app.appendChild(tooltip);

// Click hint
const clickHint = document.createElement('div');
clickHint.className = 'click-hint';
clickHint.innerHTML = '<span>🖱</span> Click map for Neighbourhood Pulse';
app.appendChild(clickHint);

// ─── Init map ────────────────────────────────────────────────────────────────

function setLoading(msg: string, pct: number) {
  const bar = document.getElementById('loading-bar');
  const status = document.getElementById('loading-status');
  if (bar) bar.style.width = `${pct}%`;
  if (status) status.textContent = msg;
}

setLoading('Initialising map...', 10);
const { map } = initMap(mapCanvas);

map.on('load', async () => {
  setLoading('Map ready — loading data sources...', 30);

  // Subscribe to store changes to update UI
  store.subscribe((state) => {
    renderEventPanel(state.selectedEvent);
    renderDataSources();
    updateStats();
  });

  // Click on empty map → neighbourhood pulse card
  map.on('click', (e) => {
    const { lngLat } = e;
    // Small delay to let deck.gl click handler fire first
    setTimeout(() => {
      if (!store.getState().selectedEvent) {
        computeNeighbourhoodPulse(lngLat.lat, lngLat.lng);
      }
    }, 50);
  });

  // Hover tooltip follows mouse
  store.subscribe((state) => {
    const hovered = state.hoveredEvent;
    if (hovered) {
      tooltip.style.display = 'block';
      tooltip.textContent = hovered.title;
    } else {
      tooltip.style.display = 'none';
    }
  });

  mapCanvas.addEventListener('mousemove', (e) => {
    const me = e as MouseEvent;
    tooltip.style.left = `${me.clientX + 14}px`;
    tooltip.style.top = `${me.clientY - 28}px`;
  });

  // Initial render
  renderLayerToggles();
  renderDataSources();

  await loadAllData();

  // Dismiss loading overlay
  setLoading('Ready', 100);
  setTimeout(() => {
    loadingOverlay.classList.add('fade-out');
    setTimeout(() => loadingOverlay.remove(), 500);
  }, 300);

  // Auto-refresh real-time layers every 5 min
  setInterval(loadRealTimeLayers, 5 * 60 * 1000);

  // Refresh timestamp ticker
  setInterval(updateRefreshTime, 30_000);

  // Refresh button
  document.getElementById('refresh-btn')?.addEventListener('click', async () => {
    const btn = document.getElementById('refresh-btn')!;
    btn.classList.add('spinning');
    await loadAllData();
    btn.classList.remove('spinning');
  });
});

// ─── Data loading ─────────────────────────────────────────────────────────────

type Loader = {
  id: string;
  label: string;
  fetch: () => Promise<PulseEvent[]>;
  category: EventCategory;
  refreshInterval?: number; // minutes — defined means real-time layer
};

const LOADERS: Loader[] = [
  { id: 'ttc', label: 'TTC Delays', fetch: fetchTTCDelays, category: 'ttc', refreshInterval: 2 },
  { id: '311', label: '311 Complaints', fetch: fetch311Complaints, category: '311', refreshInterval: 5 },
  { id: 'traffic', label: 'Road Closures', fetch: fetchTrafficIncidents, category: 'traffic', refreshInterval: 5 },
  { id: 'airquality', label: 'Air Quality (ECCC)', fetch: fetchAirQuality, category: 'airquality', refreshInterval: 60 },
  { id: 'restaurant', label: 'DineSafe', fetch: fetchRestaurantInspections, category: 'restaurant' },
  { id: 'shelter', label: 'Shelter Capacity', fetch: fetchShelterCapacity, category: 'shelter', refreshInterval: 60 },
  { id: 'construction', label: 'Construction', fetch: fetchConstruction, category: 'construction' },
  { id: 'crime', label: 'Crime Incidents (TPS)', fetch: fetchCrimeIncidents, category: 'crime' },
];

async function loadLoader(loader: Loader): Promise<void> {
  store.setDataSource({ id: loader.id, label: loader.label, status: 'loading' });
  try {
    const events = await loader.fetch();
    // Replace this category's events on each refresh to avoid duplication
    const existing = store.getState().events.filter(e => e.category !== loader.category);
    store.setEvents([...existing, ...events]);
    store.setDataSource({
      id: loader.id,
      label: loader.label,
      status: 'ok',
      count: events.length,
      lastFetched: Date.now(),
    });
  } catch {
    store.setDataSource({ id: loader.id, label: loader.label, status: 'error' });
  }
}

async function loadAllData(): Promise<void> {
  store.setState({ loading: true });
  let loaded = 0;
  setLoading('Loading data...', 30);

  await Promise.allSettled(
    LOADERS.map(loader =>
      loadLoader(loader).then(() => {
        loaded++;
        setLoading(`Loaded ${loader.label}`, 30 + (loaded / LOADERS.length) * 60);
      })
    )
  );

  store.setState({ loading: false, lastRefresh: Date.now() });
  updateStats();
  renderDataSources();
  updateRefreshTime();
}

async function loadRealTimeLayers(): Promise<void> {
  const realTime = LOADERS.filter(l => l.refreshInterval && l.refreshInterval <= 10);
  await Promise.allSettled(realTime.map(l => loadLoader(l)));
  store.setState({ lastRefresh: Date.now() });
  updateRefreshTime();
}
