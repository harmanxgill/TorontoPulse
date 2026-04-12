/**
 * Event detail panel — shown when user clicks on a map marker
 * Also handles the Neighbourhood Pulse Card
 */

import { store } from '../store';
import type { PulseEvent } from '../adapters/types';
import { flyTo } from '../map';

const SEVERITY_LABELS: Record<string, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
};

const SEVERITY_COLORS: Record<string, string> = {
  low: '#4ade80',
  medium: '#facc15',
  high: '#fb923c',
  critical: '#f87171',
};

const CATEGORY_LABELS: Record<string, string> = {
  ttc: 'TTC Transit',
  '311': '311 Service',
  restaurant: 'DineSafe',
  construction: 'Construction',
  airquality: 'Air Quality',
  traffic: 'Road Closure',
  shelter: 'Shelter',
  crime: 'Crime Incident',
};

function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = Date.now();
  const diff = now - ts;
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
}

export function buildEventPanel(): HTMLElement {
  const panel = document.createElement('div');
  panel.id = 'event-panel';
  panel.className = 'event-panel hidden';
  return panel;
}

export function renderEventPanel(event: PulseEvent | null) {
  const panel = document.getElementById('event-panel');
  if (!panel) return;

  if (!event) {
    panel.classList.add('hidden');
    return;
  }

  panel.classList.remove('hidden');

  const color = SEVERITY_COLORS[event.severity] ?? '#888';
  const label = CATEGORY_LABELS[event.category] ?? event.category;

  const metaRows = event.metadata
    ? Object.entries(event.metadata)
        .filter(([, v]) => v !== '' && v !== undefined && v !== null)
        .slice(0, 5)
        .map(([k, v]) => {
          const key = k.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').toLowerCase();
          return `<div class="meta-row"><span class="meta-key">${key}</span><span class="meta-val">${v}</span></div>`;
        })
        .join('')
    : '';

  panel.innerHTML = `
    <div class="ep-header">
      <div class="ep-category" style="color:${color}">${label}</div>
      <button class="ep-close" id="ep-close">✕</button>
    </div>
    <div class="ep-title">${event.title}</div>
    <div class="ep-meta-row">
      <span class="ep-severity" style="background:${color}20;color:${color};border:1px solid ${color}40">
        ${SEVERITY_LABELS[event.severity]}
      </span>
      <span class="ep-time">${formatTime(event.timestamp)}</span>
    </div>
    ${event.description ? `<div class="ep-desc">${event.description}</div>` : ''}
    ${metaRows ? `<div class="ep-meta">${metaRows}</div>` : ''}
    <div class="ep-coords">${event.lat.toFixed(4)}°N, ${Math.abs(event.lng).toFixed(4)}°W</div>
    <button class="ep-zoom-btn" id="ep-zoom">Zoom to location</button>
  `;

  document.getElementById('ep-close')?.addEventListener('click', () => {
    store.setSelectedEvent(null);
  });

  document.getElementById('ep-zoom')?.addEventListener('click', () => {
    flyTo(event.lng, event.lat, 16);
  });
}

// Neighbourhood Pulse Card — synthesises all layers for a clicked location
export function buildNeighbourhoodCard(): HTMLElement {
  const card = document.createElement('div');
  card.id = 'neighbourhood-card';
  card.className = 'neighbourhood-card hidden';
  return card;
}

export function computeNeighbourhoodPulse(lat: number, lng: number): void {
  const card = document.getElementById('neighbourhood-card');
  if (!card) return;

  const events = store.getState().events;
  const radius = 0.015; // ~1.5km radius

  // Filter events within radius
  const nearby = events.filter(e =>
    Math.abs(e.lat - lat) < radius && Math.abs(e.lng - lng) < radius
  );

  const cutoff24h = Date.now() - 24 * 60 * 60 * 1000;

  // Transit reliability (fewer delays = better)
  const ttcDelays = nearby.filter(e => e.category === 'ttc').length;
  const transitScore = Math.max(0, 100 - ttcDelays * 15);

  // Noise (fewer 311 noise complaints = better)
  const noiseComplaints = nearby.filter(e =>
    e.category === '311' &&
    e.title.toLowerCase().includes('noise') &&
    e.timestamp >= cutoff24h
  ).length;
  const noiseScore = Math.max(0, 100 - noiseComplaints * 8);

  // Air quality (higher AQHI = worse)
  const aqEvents = nearby.filter(e => e.category === 'airquality');
  const avgAqhi = aqEvents.length > 0
    ? aqEvents.reduce((s, e) => s + (Number(e.metadata?.aqhi) || 3), 0) / aqEvents.length
    : 3;
  const aqScore = Math.max(0, 100 - (avgAqhi - 1) * 12);

  // Restaurant safety (more fails = worse)
  const restEvents = nearby.filter(e => e.category === 'restaurant');
  const restFails = restEvents.filter(e => e.severity === 'critical').length;
  const restScore = restEvents.length > 0
    ? Math.max(0, 100 - (restFails / restEvents.length) * 100)
    : 80;

  // Active construction (more = lower liveability)
  const constructionCount = nearby.filter(e =>
    e.category === 'construction' || e.category === 'traffic'
  ).length;
  const constructionScore = Math.max(0, 100 - constructionCount * 10);

  const overall = Math.round(
    (transitScore * 0.3 + noiseScore * 0.2 + aqScore * 0.25 + restScore * 0.15 + constructionScore * 0.1)
  );

  function scoreBar(score: number): string {
    const color = score >= 70 ? '#4ade80' : score >= 40 ? '#facc15' : '#f87171';
    return `
      <div class="pulse-bar-wrap">
        <div class="pulse-bar" style="width:${score}%;background:${color}"></div>
      </div>
    `;
  }

  function scoreLabel(score: number): string {
    if (score >= 80) return 'Excellent';
    if (score >= 60) return 'Good';
    if (score >= 40) return 'Fair';
    return 'Poor';
  }

  const overallColor = overall >= 70 ? '#4ade80' : overall >= 40 ? '#facc15' : '#f87171';

  card.innerHTML = `
    <div class="nc-header">
      <div>
        <div class="nc-title">Neighbourhood Pulse</div>
        <div class="nc-coords">${lat.toFixed(3)}°N, ${Math.abs(lng).toFixed(3)}°W</div>
      </div>
      <div class="nc-overall" style="color:${overallColor}">${overall}</div>
      <button class="nc-close" id="nc-close">✕</button>
    </div>
    <div class="nc-overall-label" style="color:${overallColor}">${scoreLabel(overall)} liveability right now</div>

    <div class="nc-scores">
      <div class="nc-row">
        <span class="nc-metric">🚇 Transit</span>
        <span class="nc-val" style="color:${transitScore >= 70 ? '#4ade80' : transitScore >= 40 ? '#facc15' : '#f87171'}">${transitScore}</span>
        ${scoreBar(transitScore)}
      </div>
      <div class="nc-row">
        <span class="nc-metric">🔇 Noise</span>
        <span class="nc-val" style="color:${noiseScore >= 70 ? '#4ade80' : noiseScore >= 40 ? '#facc15' : '#f87171'}">${noiseScore}</span>
        ${scoreBar(noiseScore)}
      </div>
      <div class="nc-row">
        <span class="nc-metric">💨 Air Quality</span>
        <span class="nc-val" style="color:${aqScore >= 70 ? '#4ade80' : aqScore >= 40 ? '#facc15' : '#f87171'}">${Math.round(aqScore)}</span>
        ${scoreBar(aqScore)}
      </div>
      <div class="nc-row">
        <span class="nc-metric">🍽️ DineSafe</span>
        <span class="nc-val" style="color:${restScore >= 70 ? '#4ade80' : restScore >= 40 ? '#facc15' : '#f87171'}">${Math.round(restScore)}</span>
        ${scoreBar(restScore)}
      </div>
      <div class="nc-row">
        <span class="nc-metric">🏗️ Disruption</span>
        <span class="nc-val" style="color:${constructionScore >= 70 ? '#4ade80' : constructionScore >= 40 ? '#facc15' : '#f87171'}">${constructionScore}</span>
        ${scoreBar(constructionScore)}
      </div>
    </div>

    <div class="nc-nearby">
      ${nearby.length} events nearby · ${aqEvents.length > 0 ? `AQHI ${avgAqhi.toFixed(1)}` : 'No AQ data'} · ${ttcDelays} TTC alerts
    </div>
  `;

  card.classList.remove('hidden');

  document.getElementById('nc-close')?.addEventListener('click', () => {
    card.classList.add('hidden');
  });
}
