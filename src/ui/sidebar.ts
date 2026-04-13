/**
 * Sidebar UI — layer toggles, data source status, live stats
 */

import { store } from '../store';
import type { EventCategory } from '../adapters/types';

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
            <div class="stat-label">311 calls today</div>
          </div>
          <div class="stat-card">
            <div class="stat-value" id="stat-aqhi">—</div>
            <div class="stat-label">Avg AQHI</div>
          </div>
          <div class="stat-card">
            <div class="stat-value" id="stat-shelter">—</div>
            <div class="stat-label">Shelters full</div>
          </div>
        </div>
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
  const cutoff24h = Date.now() - 24 * 60 * 60 * 1000;

  const ttcEl = document.getElementById('stat-ttc');
  if (ttcEl) {
    const count = allEvents.filter(e => e.category === 'ttc').length;
    ttcEl.textContent = count > 0 ? String(count) : '—';
    ttcEl.className = `stat-value ${count > 5 ? 'stat-critical' : count > 2 ? 'stat-warn' : count > 0 ? 'stat-ok' : ''}`;
  }

  const el311 = document.getElementById('stat-311');
  if (el311) {
    const count = allEvents.filter(e => e.category === '311' && e.timestamp >= cutoff24h).length;
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

  const shelterEl = document.getElementById('stat-shelter');
  if (shelterEl) {
    const shelterEvents = allEvents.filter(e => e.category === 'shelter');
    if (shelterEvents.length > 0) {
      const full = shelterEvents.filter(e => e.severity === 'critical').length;
      shelterEl.textContent = `${full}/${shelterEvents.length}`;
      shelterEl.className = `stat-value ${full / shelterEvents.length > 0.5 ? 'stat-critical' : 'stat-warn'}`;
    } else {
      shelterEl.textContent = '—';
    }
  }
}

export function updateRefreshTime() {
  const el = document.getElementById('last-refresh');
  if (!el) return;
  const last = store.getState().lastRefresh;
  if (!last) { el.textContent = 'Loading...'; return; }
  const sec = Math.floor((Date.now() - last) / 1000);
  el.textContent = sec < 60 ? `Updated ${sec}s ago` : `Updated ${Math.floor(sec / 60)}m ago`;
}
