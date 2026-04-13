/**
 * Sidebar UI — layer toggles, data source status, live stats
 */

import { store } from '../store';
import type { EventCategory, PulseEvent } from '../adapters/types';

export function buildSidebar(): HTMLElement {
  const sidebar = document.createElement('aside');
  sidebar.id = 'sidebar';
  sidebar.innerHTML = `
    <div class="sidebar-header">
      <div class="logo">
        <span class="logo-pulse"></span>
        <div>
          <h1>Toronto<span class="logo-accent">Pulse</span></h1>
          <p class="tagline">Live urban intelligence</p>
        </div>
        <a class="github-link" href="https://github.com/harmanxgill/TorontoPulse" target="_blank" rel="noopener" title="View source on GitHub">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 2C6.477 2 2 6.477 2 12c0 4.418 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.009-.868-.013-1.703-2.782.604-3.369-1.342-3.369-1.342-.454-1.155-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0 1 12 6.836a9.59 9.59 0 0 1 2.504.337c1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.202 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.741 0 .267.18.578.688.48C19.138 20.163 22 16.418 22 12c0-5.523-4.477-10-10-10z"/>
          </svg>
        </a>
      </div>
    </div>

    <div class="sidebar-scroll">
      <div class="sidebar-section">
        <div class="section-label">LAYERS</div>
        <div id="layer-toggles"></div>
      </div>

      <div class="sidebar-section">
        <div class="section-label">LIVE STATS</div>
        <div id="live-stats" class="stats-grid">
          <div class="stat-card">
            <div class="stat-value" id="stat-ttc">—</div>
            <div class="stat-label">TTC delays</div>
          </div>
          <div class="stat-card">
            <div class="stat-value" id="stat-311">—</div>
            <div class="stat-label">311 past 15 days</div>
          </div>
          <div class="stat-card">
            <div class="stat-value" id="stat-aqhi">—</div>
            <div class="stat-label">Avg AQHI</div>
          </div>
          <div class="stat-card" id="shelter-stat-card" style="display:none">
            <div class="stat-value" id="stat-shelter">—</div>
            <div class="stat-sub" id="stat-shelter-rate"></div>
            <div class="stat-label">Beds available tonight</div>
          </div>
        </div>
      </div>

      <div class="sidebar-section" id="shelter-sectors-section" style="display:none">
        <div class="section-label">SHELTER SECTORS</div>
        <div id="shelter-sectors"></div>
      </div>

      <div class="sidebar-section">
        <div class="section-label">DATA SOURCES</div>
        <div id="data-sources"></div>
      </div>
    </div>

    <div class="sidebar-footer">
      <span id="last-refresh">Connecting...</span>
      <button id="refresh-btn" class="refresh-btn" title="Refresh all data">&#8635;</button>
    </div>
  `;

  return sidebar;
}

export function renderLayerToggles() {
  const container = document.getElementById('layer-toggles');
  if (!container) return;

  const { layers } = store.getState();
  container.innerHTML = '';

  for (const layer of layers) {
    const toggle = document.createElement('div');
    toggle.className = `layer-toggle ${layer.enabled ? 'enabled' : ''}`;
    toggle.dataset.id = layer.id;

    const colorHex = `rgb(${layer.color[0]},${layer.color[1]},${layer.color[2]})`;

    toggle.innerHTML = `
      <div class="toggle-left">
        <div class="toggle-dot" style="background:${colorHex};box-shadow:0 0 6px ${colorHex}60"></div>
        <div>
          <div class="toggle-label">${layer.label}</div>
          <div class="toggle-desc">${layer.description}</div>
        </div>
      </div>
      <div class="toggle-switch ${layer.enabled ? 'on' : ''}">
        <div class="toggle-thumb"></div>
      </div>
    `;

    toggle.addEventListener('click', () => {
      store.toggleLayer(layer.id as EventCategory);
      renderLayerToggles();
    });

    container.appendChild(toggle);
  }
}

export function renderDataSources() {
  const container = document.getElementById('data-sources');
  if (!container) return;

  const { dataSources } = store.getState();

  if (dataSources.length === 0) {
    container.innerHTML = '<div class="ds-loading">Connecting to data sources...</div>';
    return;
  }

  container.innerHTML = dataSources.map(ds => `
    <div class="data-source">
      <div class="ds-dot ds-dot-${ds.status}"></div>
      <span class="ds-label">${ds.label}</span>
      ${ds.count !== undefined ? `<span class="ds-count">${ds.count.toLocaleString()}</span>` : ''}
    </div>
  `).join('');
}

export function updateStats() {
  const allEvents = store.getState().events;

  const ttcEl = document.getElementById('stat-ttc');
  if (ttcEl) {
    const count = allEvents.filter(e => e.category === 'ttc').length;
    ttcEl.textContent = count > 0 ? String(count) : '—';
    ttcEl.className = `stat-value ${count > 5 ? 'stat-critical' : count > 2 ? 'stat-warn' : count > 0 ? 'stat-ok' : ''}`;
  }

  const el311 = document.getElementById('stat-311');
  if (el311) {
    const cutoff7d = Date.now() - 15 * 24 * 60 * 60 * 1000;
    const count = allEvents.filter(e => e.category === '311' && e.timestamp >= cutoff7d).length;
    el311.textContent = count > 0 ? (count > 999 ? `${(count / 1000).toFixed(1)}k` : String(count)) : '—';
  }

  const aqhiEl = document.getElementById('stat-aqhi');
  if (aqhiEl) {
    const aqEvents = allEvents.filter(e => e.category === 'airquality');
    if (aqEvents.length > 0) {
      const avg = aqEvents.reduce((sum, e) => sum + (Number(e.metadata?.aqhi) || 3), 0) / aqEvents.length;
      aqhiEl.textContent = avg.toFixed(1);
      aqhiEl.className = `stat-value ${avg >= 7 ? 'stat-critical' : avg >= 4 ? 'stat-warn' : 'stat-ok'}`;
    } else {
      aqhiEl.textContent = '—';
    }
  }

  const shelterEl    = document.getElementById('stat-shelter');
  const shelterRateEl = document.getElementById('stat-shelter-rate');
  if (shelterEl) {
    const shelterEvents  = allEvents.filter(e => e.category === 'shelter');
    if (shelterEvents.length > 0) {
      const totalAvailable = shelterEvents.reduce((sum, e) => sum + (Number(e.metadata?.available) || 0), 0);
      const totalCapacity  = shelterEvents.reduce((sum, e) => sum + (Number(e.metadata?.capacity) || 0), 0);
      const systemRate     = totalCapacity > 0 ? (totalCapacity - totalAvailable) / totalCapacity : 0;
      const systemPct      = Math.round(systemRate * 100);
      shelterEl.textContent    = String(totalAvailable);
      shelterEl.className      = `stat-value ${systemRate >= 0.98 ? 'stat-critical' : systemRate >= 0.90 ? 'stat-warn' : 'stat-ok'}`;
      if (shelterRateEl) shelterRateEl.textContent = `System ${systemPct}%`;
    } else {
      shelterEl.textContent    = '—';
      shelterEl.className      = 'stat-value';
      if (shelterRateEl) shelterRateEl.textContent = '';
    }
  }
}

// Sector display labels and ring colors (mirrors layers/index.ts SECTOR_RING_COLOR)
const SECTOR_META: Record<string, { label: string; color: string }> = {
  'Women':       { label: 'Women',    color: '#f472b6' },
  'Youth':       { label: 'Youth',    color: '#facc15' },
  'Families':    { label: 'Families', color: '#34d399' },
  'Men':         { label: 'Men',      color: '#60a5fa' },
  'Mixed Adult': { label: 'Mixed',    color: '#94a3b8' },
  'Co-ed':       { label: 'Co-ed',    color: '#94a3b8' },
};

export function renderShelterBreakdown() {
  const section   = document.getElementById('shelter-sectors-section');
  const container = document.getElementById('shelter-sectors');
  const statCard  = document.getElementById('shelter-stat-card');
  if (!section || !container) return;

  const state        = store.getState();
  const layerEnabled = state.layers.find(l => l.id === 'shelter')?.enabled ?? false;
  const events       = state.events.filter((e: PulseEvent) => e.category === 'shelter');

  if (!layerEnabled || events.length === 0) {
    section.style.display = 'none';
    if (statCard) statCard.style.display = 'none';
    return;
  }

  if (statCard) statCard.style.display = '';

  // Aggregate by sector
  const bySecctor = new Map<string, { available: number; capacity: number }>();
  for (const e of events) {
    const sector = String(e.metadata?.sector || 'Other').trim() || 'Other';
    const cur    = bySecctor.get(sector) ?? { available: 0, capacity: 0 };
    bySecctor.set(sector, {
      available: cur.available + (Number(e.metadata?.available) || 0),
      capacity:  cur.capacity  + (Number(e.metadata?.capacity)  || 0),
    });
  }

  // Sort: known sectors first, alphabetical otherwise
  const ORDER = ['Women', 'Men', 'Youth', 'Families', 'Mixed Adult', 'Co-ed'];
  const sorted = [...bySecctor.entries()].sort(([a], [b]) => {
    const ai = ORDER.indexOf(a), bi = ORDER.indexOf(b);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.localeCompare(b);
  });

  container.innerHTML = sorted.map(([sector, { available, capacity }]) => {
    const pct   = capacity > 0 ? Math.round((capacity - available) / capacity * 100) : 0;
    const meta  = SECTOR_META[sector];
    const color = meta?.color ?? '#94a3b8';
    const label = meta?.label ?? sector;
    const avColor = available === 0 ? '#f87171' : available <= 5 ? '#fb923c' : '#e2e8f0';
    const barW  = Math.min(100, pct);
    const barColor = pct >= 98 ? '#f87171' : pct >= 90 ? '#fb923c' : pct >= 75 ? '#facc15' : '#4ade80';
    return `
      <div class="sector-row">
        <div class="sector-dot" style="background:${color}"></div>
        <div class="sector-label">${label}</div>
        <div class="sector-avail" style="color:${avColor}">${available === 0 ? 'Full' : available}</div>
        <div class="sector-bar-wrap">
          <div class="sector-bar" style="width:${barW}%;background:${barColor}"></div>
        </div>
        <div class="sector-pct">${pct}%</div>
      </div>
    `;
  }).join('');

  section.style.display = '';
}

export function updateRefreshTime() {
  const el = document.getElementById('last-refresh');
  if (!el) return;
  const last = store.getState().lastRefresh;
  if (!last) { el.textContent = 'Loading...'; return; }
  const sec = Math.floor((Date.now() - last) / 1000);
  el.textContent = sec < 60 ? `Updated ${sec}s ago` : `Updated ${Math.floor(sec / 60)}m ago`;
}
