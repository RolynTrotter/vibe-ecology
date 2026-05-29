// ===========================================================================
//  UI — compact always-on HUD plus two tabbed pop-up menus:
//   • Wexles: Harvest (per-species levels) + Colony (city tracker)
//   • Statistics: Species / Over time (graph) / Food web / Terrain
//  Detailed panels only render while visible, to stay cheap on mobile.
// ===========================================================================
import { SPECIES, TERRAIN_INFO } from './config.js';
import { ecosystemHealth } from './score.js';
import { HARVEST_LEVELS, HARVEST_LABELS } from './harvest.js';
import { BUILDINGS } from './colony.js';
import { buildFoodWeb } from './foodweb.js';

export class UI {
  constructor(handlers, harvest, colony, world) {
    this.handlers = handlers; // { onTogglePlay, onSpeed, onReset }
    this.harvest = harvest;
    this.colony = colony;
    this.world = world;
    this.harvestTab = 'harvest';
    this.statsTab = 'species';

    this.buildHarvestMenu();
    this.buildColonyPanel();
    this.buildStatsMenu();
    this.wireControls();

    this.scoreEl = document.getElementById('score');
    this.tickEl = document.getElementById('tick');
    this.fpsEl = document.getElementById('fps');
    this.totalEl = document.getElementById('total');
  }

  // ---- tab helper -------------------------------------------------------
  // Builds tab buttons into `tabsEl`; calls onSelect(id). Returns a select fn.
  makeTabs(tabsEl, defs, panels, onSelect) {
    const buttons = {};
    const select = (id) => {
      for (const d of defs) {
        buttons[d.id].classList.toggle('active', d.id === id);
        if (panels[d.id]) panels[d.id].style.display = d.id === id ? 'block' : 'none';
      }
      onSelect(id);
    };
    defs.forEach(d => {
      const b = document.createElement('button');
      b.className = 'tab';
      b.textContent = d.label;
      b.addEventListener('click', () => select(d.id));
      tabsEl.appendChild(b);
      buttons[d.id] = b;
    });
    return select;
  }

  // ---- Harvest menu -----------------------------------------------------
  buildHarvestMenu() {
    this.harvestOverlay = document.getElementById('harvest-overlay');
    this.buildHarvestRows();

    const panels = {
      harvest: document.getElementById('harvest-panel'),
      colony: document.getElementById('colony-panel'),
    };
    this.selectHarvestTab = this.makeTabs(
      document.getElementById('harvest-tabs'),
      [{ id: 'harvest', label: 'Harvest' }, { id: 'colony', label: 'Colony' }],
      panels,
      (id) => { this.harvestTab = id; if (id === 'colony') this.drawColony(); });
    this.selectHarvestTab('harvest');
  }

  // (Re)build the per-species harvest level rows. Safe to call after the roster
  // changes (dev species creation).
  buildHarvestRows() {
    const rows = document.getElementById('hm-rows');
    rows.innerHTML = '';
    this.levelButtons = {};
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

  // Rebuild every per-species DOM list after the roster changes.
  rebuildSpecies() {
    this.buildHarvestRows();
    this.buildSpeciesRows();
  }

  setLevel(speciesId, level) {
    this.harvest.setLevel(speciesId, level);
    const group = this.levelButtons[speciesId];
    for (const lv of HARVEST_LEVELS) group[lv].classList.toggle('active', lv === level);
  }

  buildColonyPanel() {
    const panel = document.getElementById('colony-panel');
    this.colonyCanvas = document.createElement('canvas');
    this.colonyCanvas.className = 'colony-canvas';
    this.colonyStatsEl = document.createElement('div');
    this.colonyStatsEl.className = 'colony-stats';
    const roster = document.createElement('div');
    roster.className = 'colony-buildings';
    this.buildingEls = BUILDINGS.map(b => {
      const el = document.createElement('div');
      el.className = 'building';
      el.innerHTML = `<span class="b-icon">${b.icon}</span>` +
        `<span class="b-name">${b.name}</span>` +
        `<span class="b-req">pop ${b.pop}</span>`;
      roster.appendChild(el);
      return el;
    });
    panel.append(this.colonyCanvas, this.colonyStatsEl, roster);
  }

  // ---- Stats menu -------------------------------------------------------
  buildStatsMenu() {
    this.statsOverlay = document.getElementById('stats-overlay');
    const body = document.getElementById('stats-body');

    // Species panel
    this.speciesPanel = document.createElement('div');
    this.buildSpeciesRows();

    // Over-time panel (population graph canvas; PopulationGraph is wired by main)
    this.overtimePanel = document.createElement('div');
    this.graphCanvas = document.createElement('canvas');
    this.graphCanvas.className = 'menu-graph';
    const caption = document.createElement('p');
    caption.className = 'hm-hint';
    caption.textContent = 'Population over time (√-scaled so rare and abundant species both read).';
    this.overtimePanel.append(this.graphCanvas, caption);

    // Food-web panel
    this.foodwebPanel = document.createElement('div');
    this.fwCanvas = document.createElement('canvas');
    this.fwCanvas.className = 'foodweb-canvas';
    this.foodwebPanel.appendChild(this.fwCanvas);

    // Terrain panel
    this.terrainPanel = document.createElement('div');

    body.append(this.speciesPanel, this.overtimePanel, this.foodwebPanel, this.terrainPanel);

    const panels = {
      species: this.speciesPanel, overtime: this.overtimePanel,
      foodweb: this.foodwebPanel, terrain: this.terrainPanel,
    };
    this.selectStatsTab = this.makeTabs(
      document.getElementById('stats-tabs'),
      [
        { id: 'species', label: 'Species' },
        { id: 'overtime', label: 'Over time' },
        { id: 'foodweb', label: 'Food web' },
        { id: 'terrain', label: 'Terrain' },
      ],
      panels,
      (id) => {
        this.statsTab = id;
        if (id === 'terrain') this.renderTerrainPanel();
        if (id === 'foodweb') this.drawFoodWeb();
      });
    this.selectStatsTab('species');
  }

  buildSpeciesRows() {
    this.speciesPanel.innerHTML = '';
    this.countEls = SPECIES.map(sp => {
      const row = document.createElement('div');
      row.className = 'sp-row';
      row.innerHTML = `<span class="dot" style="background:${sp.color}"></span>` +
        `<span class="sp-name">${sp.name}</span>`;
      const count = document.createElement('span');
      count.className = 'sp-count'; count.textContent = '0';
      row.appendChild(count);
      this.speciesPanel.appendChild(row);
      return count;
    });
  }

  renderTerrainPanel() {
    const counts = this.world.terrainCounts();
    const total = counts.reduce((a, b) => a + b, 0) || 1;
    this.terrainPanel.innerHTML = '';
    TERRAIN_INFO.forEach((t, i) => {
      const row = document.createElement('div');
      row.className = 'sp-row';
      row.innerHTML = `<span class="dot" style="background:${t.minimap}"></span>` +
        `<span class="sp-name">${t.name}</span>` +
        `<span class="sp-count">${((counts[i] / total) * 100).toFixed(1)}%</span>`;
      this.terrainPanel.appendChild(row);
    });
  }

  // Size a menu canvas to its laid-out width and a fixed CSS height.
  fitCanvas(canvas, cssH) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.style.height = cssH + 'px';
    const w = canvas.clientWidth || 360;
    canvas.width = w * dpr; canvas.height = cssH * dpr;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w, h: cssH };
  }

  drawFoodWeb() {
    const { ctx, w, h } = this.fitCanvas(this.fwCanvas, 250);
    ctx.clearRect(0, 0, w, h);
    const fw = buildFoodWeb();
    const pad = 30;
    const rowH = (h - pad * 2) / Math.max(1, fw.maxLevel);
    const pos = new Array(SPECIES.length);
    fw.byLevel.forEach((arr, l) => {
      const y = h - pad - l * rowH;          // level 0 at the bottom
      arr.forEach((idx, k) => {
        pos[idx] = { x: pad + (w - 2 * pad) * ((k + 0.5) / arr.length), y };
      });
    });
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = 1;
    fw.edges.forEach(([from, to]) => {
      ctx.beginPath();
      ctx.moveTo(pos[from].x, pos[from].y);
      ctx.lineTo(pos[to].x, pos[to].y);
      ctx.stroke();
    });
    ctx.font = '10px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    SPECIES.forEach((sp, i) => {
      const p = pos[i];
      ctx.fillStyle = sp.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#e8edf2';
      ctx.fillText(sp.name, p.x, p.y - 12);
    });
  }

  // Slime-mold-ish colony blob; grows with population, with orbiting Wexles.
  drawColony() {
    const { ctx, w, h } = this.fitCanvas(this.colonyCanvas, 150);
    ctx.clearRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2;
    const pop = this.colony.population;
    const R = Math.min(h * 0.4, 8 + Math.sqrt(pop) * 4);
    const t = performance.now() / 1000;
    // tendrils / satellite blobs
    ctx.fillStyle = '#2f8f5b';
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + t * 0.12;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * R * 0.8, cy + Math.sin(a) * R * 0.8, R * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // core
    const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, R);
    g.addColorStop(0, '#7fe6a0'); g.addColorStop(1, '#2f8f5b');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
    // Wexles swimming just outside
    const dots = Math.min(28, Math.round(pop));
    ctx.fillStyle = '#dff3e6';
    for (let k = 0; k < dots; k++) {
      const a = (k / Math.max(1, dots)) * Math.PI * 2 + t * 0.5;
      const rr = R + 8 + (k % 3) * 4;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  updateColony() {
    const r = this.harvest.resources;
    this.colonyStatsEl.innerHTML =
      `<div class="cstat"><span class="label">Wexles</span>` +
      `<b>${Math.floor(this.colony.population).toLocaleString()}</b></div>` +
      `<div class="cstat"><span class="label">🍞 Food</span>${Math.floor(r.food).toLocaleString()}</div>` +
      `<div class="cstat"><span class="label">🧱 Material</span>${Math.floor(r.material).toLocaleString()}</div>` +
      `<div class="cstat"><span class="label">💎 Value</span>${Math.floor(r.value).toLocaleString()}</div>`;
    const pop = this.colony.population;
    BUILDINGS.forEach((b, i) => {
      this.buildingEls[i].classList.toggle('locked', pop < b.pop);
    });
    this.drawColony();
  }

  // ---- generic overlay + control wiring --------------------------------
  toggle(overlay, show) {
    const open = show ?? overlay.hasAttribute('hidden');
    overlay.toggleAttribute('hidden', !open);
    return open;
  }

  wireControls() {
    const play = document.getElementById('btn-play');
    play.addEventListener('click', () => {
      play.textContent = this.handlers.onTogglePlay() ? '⏸' : '▶';
    });
    document.getElementById('btn-speed').addEventListener('click', (e) => {
      e.target.textContent = this.handlers.onSpeed() + '×';
    });
    document.getElementById('btn-reset').addEventListener('click',
      () => this.handlers.onReset());

    this.wireMenu('btn-harvest', this.harvestOverlay, 'hm-close',
      () => { if (this.harvestTab === 'colony') this.drawColony(); });
    this.wireMenu('btn-stats', this.statsOverlay, 'stats-close',
      () => {
        if (this.statsTab === 'terrain') this.renderTerrainPanel();
        if (this.statsTab === 'foodweb') this.drawFoodWeb();
      });
  }

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

  // True when the population graph is on screen (Stats > Over time).
  isGraphVisible() {
    return this.statsTab === 'overtime' && !this.statsOverlay.hasAttribute('hidden');
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

    if (this.statsTab === 'species' && !this.statsOverlay.hasAttribute('hidden')) {
      for (let i = 0; i < this.countEls.length; i++) {
        this.countEls[i].textContent = counts[i].toLocaleString();
      }
    }
    if (this.harvestTab === 'colony' && !this.harvestOverlay.hasAttribute('hidden')) {
      this.updateColony();
    }
  }
}
