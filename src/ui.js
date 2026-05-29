// ===========================================================================
//  UI — a compact always-on HUD (health / critters / tick / fps), plus two
//  pop-up menus: Harvesting (per-species levels) and Stats (tabbed detail:
//  species populations + terrain breakdown). The detailed "ledgers" are closed
//  by default to keep the screen uncluttered.
// ===========================================================================
import { SPECIES, TERRAIN_INFO } from './config.js';
import { ecosystemHealth } from './score.js';
import { HARVEST_LEVELS, HARVEST_LABELS } from './harvest.js';

export class UI {
  constructor(handlers, harvest, world) {
    this.handlers = handlers; // { onTogglePlay, onSpeed, onReset, onToggleGraph }
    this.harvest = harvest;
    this.world = world;
    this.activeTab = 'species';

    this.buildHarvestMenu();
    this.buildStatsMenu();
    this.wireControls();

    this.scoreEl = document.getElementById('score');
    this.tickEl = document.getElementById('tick');
    this.fpsEl = document.getElementById('fps');
    this.totalEl = document.getElementById('total');
  }

  // ---- Harvesting menu --------------------------------------------------
  buildHarvestMenu() {
    this.harvestOverlay = document.getElementById('harvest-overlay');
    this.resourceEl = document.getElementById('hm-resources');
    const rows = document.getElementById('hm-rows');
    this.levelButtons = {}; // speciesId -> { level -> button }

    SPECIES.forEach(sp => {
      const row = document.createElement('div');
      row.className = 'hm-row';
      const label = document.createElement('div');
      label.className = 'hm-label';
      label.innerHTML =
        `<span class="dot" style="background:${sp.color}"></span>${sp.name}`;
      const seg = document.createElement('div');
      seg.className = 'hm-seg';
      this.levelButtons[sp.id] = {};
      HARVEST_LEVELS.forEach(level => {
        const b = document.createElement('button');
        b.textContent = HARVEST_LABELS[level];
        b.className = 'hm-opt';
        if (this.harvest.getLevel(sp.id) === level) b.classList.add('active');
        b.addEventListener('click', () => this.setLevel(sp.id, level));
        seg.appendChild(b);
        this.levelButtons[sp.id][level] = b;
      });
      row.append(label, seg);
      rows.appendChild(row);
    });
  }

  setLevel(speciesId, level) {
    this.harvest.setLevel(speciesId, level);
    const group = this.levelButtons[speciesId];
    for (const lv of HARVEST_LEVELS) group[lv].classList.toggle('active', lv === level);
  }

  // ---- Stats menu (tabbed) ----------------------------------------------
  buildStatsMenu() {
    this.statsOverlay = document.getElementById('stats-overlay');
    const tabsEl = document.getElementById('stats-tabs');
    const body = document.getElementById('stats-body');

    const tabs = [
      { id: 'species', label: 'Species' },
      { id: 'terrain', label: 'Terrain' },
    ];
    this.tabButtons = {};
    tabs.forEach(t => {
      const b = document.createElement('button');
      b.className = 'tab';
      b.textContent = t.label;
      b.addEventListener('click', () => this.selectTab(t.id));
      tabsEl.appendChild(b);
      this.tabButtons[t.id] = b;
    });

    // Species panel: a colored row per species, count updated while open.
    this.speciesPanel = document.createElement('div');
    this.countEls = SPECIES.map(sp => {
      const row = document.createElement('div');
      row.className = 'sp-row';
      const dot = document.createElement('span');
      dot.className = 'dot'; dot.style.background = sp.color;
      const name = document.createElement('span');
      name.className = 'sp-name'; name.textContent = sp.name;
      const count = document.createElement('span');
      count.className = 'sp-count'; count.textContent = '0';
      row.append(dot, name, count);
      this.speciesPanel.appendChild(row);
      return count;
    });

    // Terrain panel: coverage per terrain type (recomputed when opened).
    this.terrainPanel = document.createElement('div');

    body.append(this.speciesPanel, this.terrainPanel);
    this.selectTab(this.activeTab);
  }

  selectTab(id) {
    this.activeTab = id;
    for (const [tid, btn] of Object.entries(this.tabButtons)) {
      btn.classList.toggle('active', tid === id);
    }
    this.speciesPanel.style.display = id === 'species' ? 'block' : 'none';
    this.terrainPanel.style.display = id === 'terrain' ? 'block' : 'none';
    if (id === 'terrain') this.renderTerrainPanel();
  }

  renderTerrainPanel() {
    const counts = this.world.terrainCounts();
    const total = counts.reduce((a, b) => a + b, 0) || 1;
    this.terrainPanel.innerHTML = '';
    TERRAIN_INFO.forEach((t, i) => {
      const pct = (counts[i] / total) * 100;
      const row = document.createElement('div');
      row.className = 'sp-row';
      row.innerHTML =
        `<span class="dot" style="background:${t.minimap}"></span>` +
        `<span class="sp-name">${t.name}</span>` +
        `<span class="sp-count">${pct.toFixed(1)}%</span>`;
      this.terrainPanel.appendChild(row);
    });
  }

  // ---- Generic overlay toggle ------------------------------------------
  toggle(overlay, show) {
    const open = show ?? overlay.hasAttribute('hidden');
    overlay.toggleAttribute('hidden', !open);
    return open;
  }

  wireControls() {
    const play = document.getElementById('btn-play');
    play.addEventListener('click', () => {
      const running = this.handlers.onTogglePlay();
      play.textContent = running ? '⏸' : '▶';
    });
    document.getElementById('btn-speed').addEventListener('click', (e) => {
      e.target.textContent = this.handlers.onSpeed() + '×';
    });
    document.getElementById('btn-reset').addEventListener('click',
      () => this.handlers.onReset());
    const g = document.getElementById('btn-graph');
    g.addEventListener('click', () => {
      g.classList.toggle('active', this.handlers.onToggleGraph());
    });

    this.wireMenu('btn-harvest', this.harvestOverlay, 'hm-close');
    this.wireMenu('btn-stats', this.statsOverlay, 'stats-close',
      () => { if (this.activeTab === 'terrain') this.renderTerrainPanel(); });
  }

  // Wire a control button + close button + backdrop tap for an overlay.
  wireMenu(btnId, overlay, closeId, onOpen) {
    const btn = document.getElementById(btnId);
    const close = () => { this.toggle(overlay, false); btn.classList.remove('active'); };
    btn.addEventListener('click', () => {
      const open = this.toggle(overlay);
      btn.classList.toggle('active', open);
      if (open && onOpen) onOpen();
    });
    document.getElementById(closeId).addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  }

  update(sim, fps) {
    const counts = sim.store.counts;
    const health = ecosystemHealth(counts);
    this.scoreEl.textContent = health.score;
    this.scoreEl.style.color =
      health.score > 66 ? '#6fdb8f' : health.score > 33 ? '#e6c45f' : '#e67a7a';
    this.tickEl.textContent = sim.tick.toLocaleString();
    this.totalEl.textContent = sim.store.living.toLocaleString();
    if (this.fpsEl) this.fpsEl.textContent = fps.toFixed(0);

    // Per-species counts only while the Stats > Species tab is open.
    if (this.activeTab === 'species' && !this.statsOverlay.hasAttribute('hidden')) {
      for (let i = 0; i < this.countEls.length; i++) {
        this.countEls[i].textContent = counts[i].toLocaleString();
      }
    }
    // Harvest resource tally only while that menu is open.
    if (!this.harvestOverlay.hasAttribute('hidden')) {
      const r = this.harvest.resources;
      this.resourceEl.innerHTML =
        `<span>🍞 ${Math.floor(r.food).toLocaleString()}</span>` +
        `<span>🧱 ${Math.floor(r.material).toLocaleString()}</span>` +
        `<span>💎 ${Math.floor(r.value).toLocaleString()}</span>`;
    }
  }
}
