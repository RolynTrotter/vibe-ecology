// ===========================================================================
//  UI — builds the species readout, wires the control buttons, and refreshes
//  the HUD (populations, score, tick, fps) each frame.
// ===========================================================================
import { SPECIES, TERRAIN_INFO } from './config.js';
import { ecosystemHealth } from './score.js';
import { HARVEST_LEVELS, HARVEST_LABELS } from './harvest.js';

export class UI {
  constructor(handlers, harvest) {
    this.handlers = handlers; // { onTogglePlay, onSpeed, onReset, onToggleGraph }
    this.harvest = harvest;
    this.buildSpeciesList();
    this.buildLegend();
    this.buildHarvestMenu();
    this.wireControls();
    this.scoreEl = document.getElementById('score');
    this.tickEl = document.getElementById('tick');
    this.fpsEl = document.getElementById('fps');
    this.totalEl = document.getElementById('total');
  }

  buildHarvestMenu() {
    this.overlay = document.getElementById('harvest-overlay');
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

  toggleHarvestMenu(show) {
    const open = show ?? this.overlay.hasAttribute('hidden');
    this.overlay.toggleAttribute('hidden', !open);
    return open;
  }

  buildSpeciesList() {
    const wrap = document.getElementById('species');
    this.rows = SPECIES.map(sp => {
      const row = document.createElement('div');
      row.className = 'sp-row';
      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.background = sp.color;
      const name = document.createElement('span');
      name.className = 'sp-name';
      name.textContent = sp.name;
      const count = document.createElement('span');
      count.className = 'sp-count';
      count.textContent = '0';
      row.append(dot, name, count);
      wrap.appendChild(row);
      return count;
    });
  }

  buildLegend() {
    const wrap = document.getElementById('legend');
    if (!wrap) return;
    TERRAIN_INFO.forEach(t => {
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.innerHTML =
        `<span class="dot" style="background:${t.minimap}"></span>${t.name}`;
      wrap.appendChild(chip);
    });
  }

  wireControls() {
    const play = document.getElementById('btn-play');
    play.addEventListener('click', () => {
      const running = this.handlers.onTogglePlay();
      play.textContent = running ? '⏸' : '▶';
    });
    document.getElementById('btn-speed').addEventListener('click', (e) => {
      const next = this.handlers.onSpeed();
      e.target.textContent = next + '×';
    });
    document.getElementById('btn-reset').addEventListener('click',
      () => this.handlers.onReset());
    const g = document.getElementById('btn-graph');
    g.addEventListener('click', () => {
      const shown = this.handlers.onToggleGraph();
      g.classList.toggle('active', shown);
    });

    const harvestBtn = document.getElementById('btn-harvest');
    harvestBtn.addEventListener('click', () => {
      const open = this.toggleHarvestMenu();
      harvestBtn.classList.toggle('active', open);
    });
    document.getElementById('hm-close').addEventListener('click', () => {
      this.toggleHarvestMenu(false);
      harvestBtn.classList.remove('active');
    });
    // Tap the dimmed backdrop to dismiss.
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) {
        this.toggleHarvestMenu(false);
        harvestBtn.classList.remove('active');
      }
    });
  }

  update(sim, fps) {
    const counts = sim.store.counts;
    for (let i = 0; i < this.rows.length; i++) {
      this.rows[i].textContent = counts[i].toString();
    }
    const health = ecosystemHealth(counts);
    this.scoreEl.textContent = health.score;
    this.scoreEl.style.color =
      health.score > 66 ? '#6fdb8f' : health.score > 33 ? '#e6c45f' : '#e67a7a';
    this.tickEl.textContent = sim.tick.toLocaleString();
    this.totalEl.textContent = sim.store.living.toLocaleString();
    if (this.fpsEl) this.fpsEl.textContent = fps.toFixed(0);

    // Refresh harvest resource tally only while the menu is open.
    if (!this.overlay.hasAttribute('hidden')) {
      const r = this.harvest.resources;
      this.resourceEl.innerHTML =
        `<span>🍞 ${Math.floor(r.food).toLocaleString()}</span>` +
        `<span>🧱 ${Math.floor(r.material).toLocaleString()}</span>` +
        `<span>💎 ${Math.floor(r.value).toLocaleString()}</span>`;
    }
  }
}
