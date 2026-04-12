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

    <div class="sidebar-section">
      <div class="section-label">LIVE LAYERS</div>
      <div id="layer-toggles"></div>
    </div>

    <div class="sidebar-section">
      <div class="section-label">LIVE STATS</div>
      <div id="live-stats" class="stats-grid">
        <div class="stat-card" data-stat="ttc">
          <span class="stat-icon">🚇</span>
          <div>
            <div class="stat-value" id="stat-ttc">—</div>
            <div class="stat-label">TTC delays</div>
          </div>
        </div>
        <div class="stat-card" data-stat="311">
          <span class="stat-icon">📞</span>
          <div>
            <div class="stat-value" id="stat-311">—</div>
            <div class="stat-label">311 calls today</div>
          </div>
        </div>
        <div class="stat-card" data-stat="airquality">
          <span class="stat-icon">💨</span>
          <div>
            <div class="stat-value" id="stat-aqhi">—</div>
            <div class="stat-label">Avg AQHI</div>
          </div>
        </div>
        <div class="stat-card" data-stat="shelter">
          <span class="stat-icon">🏠</span>
          <div>
            <div class="stat-value" id="stat-shelter">—</div>
            <div class="stat-label">Shelters full</div>
          </div>
        </div>
      </div>
    </div>

    <div class="sidebar-section" id="patio-section" style="display:none">
      <div class="patio-index">
        <div class="patio-header">
          <span>🍻</span>
          <span>Patio Index</span>
          <span class="patio-badge" id="patio-badge">–</span>
        </div>
        <p class="patio-desc" id="patio-desc">Calculating noise patterns...</p>
      </div>
    </div>

    <div class="sidebar-section">
      <div class="section-label">DATA SOURCES</div>
      <div id="data-sources"></div>
    </div>

    <div class="sidebar-footer">
      <span id="last-refresh">Connecting...</span>
      <button id="refresh-btn" class="refresh-btn" title="Refresh all data">↻</button>
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
        <div class="toggle-dot" style="background:${colorHex};box-shadow:0 0 6px ${colorHex}80"></div>
        <div>
          <div class="toggle-label">${layer.icon} ${layer.label}</div>
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
      ${ds.count !== undefined ? `<span class="ds-count">${ds.count}</span>` : ''}
    </div>
  `).join('');
}

export function updateStats() {
  const events = store.getVisibleEvents();
  const allEvents = store.getState().events;

  // TTC delays
  const ttcEl = document.getElementById('stat-ttc');
  if (ttcEl) {
    const ttcCount = allEvents.filter(e => e.category === 'ttc').length;
    ttcEl.textContent = String(ttcCount);
    ttcEl.className = `stat-value ${ttcCount > 5 ? 'stat-critical' : ttcCount > 2 ? 'stat-warn' : 'stat-ok'}`;
  }

  // 311 calls (last 24h)
  const el311 = document.getElementById('stat-311');
  if (el311) {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const count311 = allEvents.filter(e => e.category === '311' && e.timestamp >= cutoff).length;
    el311.textContent = count311 > 999 ? `${(count311 / 1000).toFixed(1)}k` : String(count311);
  }

  // Avg AQHI
  const aqhiEl = document.getElementById('stat-aqhi');
  if (aqhiEl) {
    const aqEvents = allEvents.filter(e => e.category === 'airquality');
    if (aqEvents.length > 0) {
      const avg = aqEvents.reduce((sum, e) => sum + (Number(e.metadata?.aqhi) || 3), 0) / aqEvents.length;
      aqhiEl.textContent = avg.toFixed(1);
      aqhiEl.className = `stat-value ${avg >= 7 ? 'stat-critical' : avg >= 4 ? 'stat-warn' : 'stat-ok'}`;
    }
  }

  // Shelters full
  const shelterEl = document.getElementById('stat-shelter');
  if (shelterEl) {
    const shelterEvents = allEvents.filter(e => e.category === 'shelter');
    const full = shelterEvents.filter(e => e.severity === 'critical').length;
    const total = shelterEvents.length;
    if (total > 0) {
      shelterEl.textContent = `${full}/${total}`;
      shelterEl.className = `stat-value ${full / total > 0.5 ? 'stat-critical' : 'stat-warn'}`;
    }
  }

  // Patio Index — night noise complaints in entertainment districts
  updatePatioIndex();

  void events; // suppress unused warning
}

function updatePatioIndex() {
  const now = new Date();
  const hour = now.getHours();
  const day = now.getDay(); // 0=Sun, 6=Sat
  const isWeekendNight = (day === 5 || day === 6) && (hour >= 21 || hour < 3);

  const section = document.getElementById('patio-section');
  const badge = document.getElementById('patio-badge');
  const desc = document.getElementById('patio-desc');
  if (!section || !badge || !desc) return;

  const noiseComplaints = store.getState().events.filter(e =>
    e.category === '311' &&
    e.title.toLowerCase().includes('noise') &&
    e.timestamp >= Date.now() - 3 * 60 * 60 * 1000
  );

  // Entertainment districts
  const kensington = noiseComplaints.filter(e =>
    e.lat > 43.648 && e.lat < 43.658 && e.lng > -79.407 && e.lng < -79.397
  ).length;
  const entertainment = noiseComplaints.filter(e =>
    e.lat > 43.643 && e.lat < 43.652 && e.lng > -79.395 && e.lng < -79.378
  ).length;
  const leslieville = noiseComplaints.filter(e =>
    e.lat > 43.660 && e.lat < 43.672 && e.lng > -79.335 && e.lng < -79.315
  ).length;

  const hotspot = Math.max(kensington, entertainment, leslieville);
  const hotspotName = kensington >= entertainment && kensington >= leslieville
    ? 'Kensington Market'
    : entertainment >= leslieville
    ? 'Entertainment District'
    : 'Leslieville';

  section.style.display = 'block';

  if (!isWeekendNight) {
    badge.textContent = '—';
    badge.className = 'patio-badge';
    desc.textContent = 'Patio season peaks Friday & Saturday nights after 9pm.';
    return;
  }

  if (hotspot === 0) {
    badge.textContent = 'QUIET';
    badge.className = 'patio-badge patio-quiet';
    desc.textContent = 'No noise clusters detected yet tonight.';
  } else if (hotspot < 3) {
    badge.textContent = 'WARMING UP';
    badge.className = 'patio-badge patio-warm';
    desc.textContent = `${hotspotName} showing early activity tonight.`;
  } else if (hotspot < 7) {
    badge.textContent = 'PEAKING';
    badge.className = 'patio-badge patio-peak';
    desc.textContent = `Patio season is peaking in ${hotspotName} right now. 🍻`;
  } else {
    badge.textContent = 'HOT';
    badge.className = 'patio-badge patio-hot';
    desc.textContent = `${hotspotName} is absolutely popping tonight.`;
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
