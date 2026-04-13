/**
 * Event detail panel — shown when user clicks on a map marker
 * Also handles the Neighbourhood Pulse Card
 */

import { store } from '../store';
import type { PulseEvent } from '../adapters/types';
import { flyTo } from '../map';
import { findNeighbourhood } from '../adapters/neighbourhoods';
import { fetchShelterHistory } from '../adapters/shelter';

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

const SECTOR_COLORS: Record<string, string> = {
  'Women':       '#f472b6',
  'Youth':       '#facc15',
  'Families':    '#34d399',
  'Men':         '#60a5fa',
  'Mixed Adult': '#94a3b8',
  'Co-ed':       '#94a3b8',
};

function buildShelterSection(event: PulseEvent): string {
  const m = event.metadata ?? {};
  const sector      = String(m.sector      || '').trim();
  const serviceType = String(m.serviceType || '').trim();
  const programModel = String(m.programModel || '').trim();
  const available   = Number(m.available)     || 0;
  const capacity    = Number(m.capacity)      || 0;
  const rate        = Number(m.occupancyRate) || 0;
  const unit        = String(m.unit           || 'beds');
  const address     = String(m.address        || '');
  const dataDate    = String(m.dataDate       || '');

  const sectorColor = SECTOR_COLORS[sector] ?? '#94a3b8';
  const availColor  = available === 0 ? '#f87171' : available <= 5 ? '#fb923c' : '#4ade80';
  const rateColor   = rate >= 98 ? '#f87171' : rate >= 90 ? '#fb923c' : rate >= 75 ? '#facc15' : '#4ade80';

  const reportedLabel = dataDate
    ? `Reported ${new Date(dataDate).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}`
    : 'Updated nightly';

  // Service type and program model are often verbose — trim and de-duplicate if they're the same
  const typeLabel = serviceType && programModel && serviceType !== programModel
    ? `${serviceType} · ${programModel}`
    : serviceType || programModel;

  return `
    <div class="shelter-panel">
      <div class="shelter-badges">
        ${sector      ? `<div class="shelter-sector-badge" style="color:${sectorColor};background:${sectorColor}18;border-color:${sectorColor}40">${sector}</div>` : ''}
        ${typeLabel   ? `<div class="shelter-type-badge">${typeLabel}</div>` : ''}
      </div>
      ${address ? `<div class="shelter-address">${address}</div>` : ''}
      <div class="shelter-stats-row">
        <div class="shelter-stat-block">
          <div class="shelter-stat-num" style="color:${availColor}">
            ${available === 0 ? 'Full' : available}
          </div>
          <div class="shelter-stat-lbl">${unit} available</div>
        </div>
        <div class="shelter-stat-block">
          <div class="shelter-stat-num">${capacity}</div>
          <div class="shelter-stat-lbl">total ${unit}</div>
        </div>
        <div class="shelter-stat-block">
          <div class="shelter-stat-num" style="color:${rateColor}">${rate}%</div>
          <div class="shelter-stat-lbl">occupancy</div>
        </div>
      </div>
      <div class="shelter-note">${reportedLabel} · City of Toronto data</div>
      <div class="shelter-history" id="shelter-history" data-location="${String(m.location || '').replace(/"/g, '&quot;')}">
        <div class="shelter-history-loading">Loading recent history...</div>
      </div>
    </div>
  `;
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

  // For shelter events use the dedicated section; otherwise show generic metadata
  const bodyContent = event.category === 'shelter'
    ? buildShelterSection(event)
    : (() => {
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
        return [
          event.description ? `<div class="ep-desc">${event.description}</div>` : '',
          metaRows ? `<div class="ep-meta">${metaRows}</div>` : '',
        ].join('');
      })();

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
    ${event.category !== 'shelter' && event.description ? '' : ''}
    ${bodyContent}
    <div class="ep-coords">${event.lat.toFixed(4)}°N, ${Math.abs(event.lng).toFixed(4)}°W</div>
    <button class="ep-zoom-btn" id="ep-zoom">Zoom to location</button>
  `;

  document.getElementById('ep-close')?.addEventListener('click', () => {
    store.setSelectedEvent(null);
  });

  document.getElementById('ep-zoom')?.addEventListener('click', () => {
    flyTo(event.lng, event.lat, 16);
  });

  // Async history fetch for shelter events — updates the placeholder once resolved
  if (event.category === 'shelter') {
    const locationName = String(event.metadata?.location || '');
    if (locationName) {
      fetchShelterHistory(locationName).then(history => {
        // Guard: make sure the same shelter is still open (user may have clicked away)
        const histEl = document.getElementById('shelter-history');
        if (!histEl || histEl.dataset.location !== locationName) return;

        if (!history) {
          histEl.style.display = 'none';
          return;
        }

        const TREND_LABEL  = { improving: 'Improving', stable: 'Stable', worsening: 'Worsening' };
        const TREND_COLOR  = { improving: '#4ade80',   stable: '#94a3b8', worsening: '#f87171'   };
        const TREND_ARROW  = { improving: '↓',         stable: '→',       worsening: '↑'         };
        const tColor = TREND_COLOR[history.trend];
        const avgColor = history.avg >= 98 ? '#f87171' : history.avg >= 90 ? '#fb923c' : history.avg >= 75 ? '#facc15' : '#4ade80';
        const deltaStr = history.delta === 0 ? '' : `${history.delta > 0 ? '+' : ''}${history.delta}%`;

        histEl.innerHTML = `
          <div class="shelter-history-row">
            <div class="sh-block">
              <div class="sh-num" style="color:${avgColor}">${history.avg}%</div>
              <div class="sh-lbl">${history.nights}-night avg</div>
            </div>
            <div class="sh-block">
              <div class="sh-num">${history.min}–${history.max}%</div>
              <div class="sh-lbl">range</div>
            </div>
            <div class="sh-block">
              <div class="sh-num" style="color:${tColor}">
                ${TREND_ARROW[history.trend]} ${TREND_LABEL[history.trend]}
              </div>
              <div class="sh-lbl">${deltaStr ? `${deltaStr} vs older` : 'no change'}</div>
            </div>
          </div>
        `;
      });
    }
  }
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
  const neighbourhoodName = findNeighbourhood(lat, lng);

  card.innerHTML = `
    <div class="nc-header">
      <div class="nc-title-block">
        <div class="nc-title">${neighbourhoodName ?? 'Neighbourhood Pulse'}</div>
        ${neighbourhoodName ? '<div class="nc-subtitle">Neighbourhood Pulse</div>' : ''}
        <div class="nc-coords">${lat.toFixed(4)}°N, ${Math.abs(lng).toFixed(4)}°W</div>
      </div>
      <div class="nc-overall" style="color:${overallColor}">${overall}</div>
      <button class="nc-close" id="nc-close">&#215;</button>
    </div>
    <div class="nc-overall-label" style="color:${overallColor}">${scoreLabel(overall)} liveability right now</div>

    <div class="nc-scores">
      <div class="nc-row">
        <span class="nc-metric">Transit</span>
        <span class="nc-val" style="color:${transitScore >= 70 ? '#4ade80' : transitScore >= 40 ? '#facc15' : '#f87171'}">${transitScore}</span>
        ${scoreBar(transitScore)}
      </div>
      <div class="nc-row">
        <span class="nc-metric">Noise</span>
        <span class="nc-val" style="color:${noiseScore >= 70 ? '#4ade80' : noiseScore >= 40 ? '#facc15' : '#f87171'}">${noiseScore}</span>
        ${scoreBar(noiseScore)}
      </div>
      <div class="nc-row">
        <span class="nc-metric">Air Quality</span>
        <span class="nc-val" style="color:${aqScore >= 70 ? '#4ade80' : aqScore >= 40 ? '#facc15' : '#f87171'}">${Math.round(aqScore)}</span>
        ${scoreBar(aqScore)}
      </div>
      <div class="nc-row">
        <span class="nc-metric">DineSafe</span>
        <span class="nc-val" style="color:${restScore >= 70 ? '#4ade80' : restScore >= 40 ? '#facc15' : '#f87171'}">${Math.round(restScore)}</span>
        ${scoreBar(restScore)}
      </div>
      <div class="nc-row">
        <span class="nc-metric">Disruption</span>
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
