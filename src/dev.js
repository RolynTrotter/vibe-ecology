// ===========================================================================
//  Dev tools — a 🛠 menu for fiddling with config live: tune per-species and
//  global values (applied to the running sim), inject populations, and create
//  new species on the fly. Intended for development / balancing.
// ===========================================================================
import { SPECIES, CONFIG, createSpecies } from './config.js';

// Editable numeric fields per kind: [key, min, max, step].
const ANIMAL_FIELDS = [
  ['speed', 0, 0.5, 0.005], ['sense', 1, 20, 0.5], ['metabolism', 0, 0.2, 0.005],
  ['maxEnergy', 5, 150, 1], ['hungerAt', 0.1, 1, 0.05], ['eatGain', 0.1, 1.5, 0.05],
  ['matureAge', 10, 800, 5], ['reproEnergy', 1, 120, 1], ['reproCost', 1, 80, 1],
  ['reproCooldown', 10, 1000, 5], ['crowdRadius', 1, 30, 1], ['crowdLimit', 0, 12, 1],
  ['fleeFactor', 0, 1, 0.1], ['size', 0.3, 3, 0.1], ['lifespan', 0, 6000, 50],
];
const PLANT_FIELDS = [
  ['growth', 0, 1.5, 0.05], ['maxEnergy', 5, 60, 1], ['matureAge', 10, 400, 5],
  ['reproEnergy', 1, 60, 1], ['reproCost', 1, 40, 1], ['reproCooldown', 10, 500, 5],
  ['spreadRadius', 1, 20, 0.5], ['crowdLimit', 0, 15, 1], ['biteEnergy', 1, 20, 1],
  ['size', 0.3, 3, 0.1],
];
const WEXLE_FIELDS = [['food', 0, 20, 1], ['material', 0, 20, 1], ['value', 0, 20, 1]];

const HABITAT_PRESETS = {
  'Shallow water': { elevation: [0.30, 0.42] },
  'Deep water': { elevation: [0, 0.32] },
  'Any water': { elevation: [0, 0.42] },
  'Land (any)': { elevation: [0.42, 0.98] },
  'Sand (dry)': { elevation: [0.42, 0.95], moisture: [0, 0.34] },
  'Mud (wet)': { elevation: [0.42, 0.95], moisture: [0.62, 1] },
  'Rock': { elevation: [0.42, 1], rockiness: [0.6, 1] },
  'Anywhere': {},
};

export class DevPanel {
  constructor(game) {
    this.game = game;
    this.overlay = document.getElementById('dev-overlay');
    this.body = document.getElementById('dev-body');
    this.tab = 'global';

    this.globalPanel = document.createElement('div');
    this.speciesPanel = document.createElement('div');
    this.createPanel = document.createElement('div');
    this.body.append(this.globalPanel, this.speciesPanel, this.createPanel);

    this.buildGlobal();
    this.buildCreate();

    const panels = { global: this.globalPanel, species: this.speciesPanel, create: this.createPanel };
    const tabsEl = document.getElementById('dev-tabs');
    const defs = [
      { id: 'global', label: 'Global' },
      { id: 'species', label: 'Species' },
      { id: 'create', label: 'Create' },
    ];
    this.tabButtons = {};
    defs.forEach(d => {
      const b = document.createElement('button');
      b.className = 'tab'; b.textContent = d.label;
      b.addEventListener('click', () => this.select(d.id, panels, defs));
      tabsEl.appendChild(b);
      this.tabButtons[d.id] = b;
    });
    this.select('global', panels, defs);
    this.wire();
  }

  select(id, panels, defs) {
    this.tab = id;
    defs.forEach(d => {
      this.tabButtons[d.id].classList.toggle('active', d.id === id);
      panels[d.id].style.display = d.id === id ? 'block' : 'none';
    });
    if (id === 'species') this.renderSpeciesTab();
    if (id === 'create') this.refreshDietChecks();
  }

  wire() {
    const btn = document.getElementById('btn-dev');
    const close = () => { this.overlay.toggleAttribute('hidden', true); btn.classList.remove('active'); };
    btn.addEventListener('click', () => {
      const open = this.overlay.hasAttribute('hidden');
      this.overlay.toggleAttribute('hidden', !open);
      btn.classList.toggle('active', open);
      if (open && this.tab === 'species') this.renderSpeciesTab();
    });
    document.getElementById('dev-close').addEventListener('click', close);
    this.overlay.addEventListener('click', (e) => { if (e.target === this.overlay) close(); });
  }

  // A labeled range slider bound to get/set.
  slider(parent, label, get, set, min, max, step) {
    const row = document.createElement('label');
    row.className = 'dev-field';
    const name = document.createElement('span'); name.className = 'dev-key'; name.textContent = label;
    const val = document.createElement('span'); val.className = 'dev-val';
    const input = document.createElement('input');
    input.type = 'range'; input.min = min; input.max = max; input.step = step;
    input.value = get();
    val.textContent = (+get()).toFixed(step < 1 ? 2 : 0);
    input.addEventListener('input', () => {
      const v = parseFloat(input.value);
      set(v);
      val.textContent = v.toFixed(step < 1 ? 2 : 0);
    });
    row.append(name, input, val);
    parent.appendChild(row);
  }

  // ---- Global tab -------------------------------------------------------
  buildGlobal() {
    const p = this.globalPanel;
    p.innerHTML = '<h4>Simulation</h4>';
    this.slider(p, 'Ticks / sec', () => CONFIG.sim.ticksPerSecond,
      v => { CONFIG.sim.ticksPerSecond = Math.max(1, v); }, 5, 120, 1);

    const world = document.createElement('div');
    world.innerHTML = '<h4>World (applied on Regenerate)</h4>';
    p.appendChild(world);
    this.slider(world, 'Noise scale', () => CONFIG.world.noiseScale,
      v => { CONFIG.world.noiseScale = v; }, 0.02, 0.12, 0.005);
    this.slider(world, 'Coral threshold', () => CONFIG.world.coralThreshold,
      v => { CONFIG.world.coralThreshold = v; }, 0.4, 0.8, 0.01);

    const seedRow = document.createElement('div');
    seedRow.className = 'dev-actions';
    const seed = document.createElement('input');
    seed.type = 'number'; seed.value = CONFIG.world.seed; seed.className = 'dev-num';
    const regen = document.createElement('button');
    regen.className = 'dev-btn'; regen.textContent = 'Regenerate world';
    regen.addEventListener('click', () => {
      CONFIG.world.seed = parseInt(seed.value, 10) || CONFIG.world.seed;
      this.game.regenerate();
    });
    seedRow.append(seed, regen);
    p.appendChild(seedRow);
  }

  // ---- Species tab ------------------------------------------------------
  renderSpeciesTab() {
    const p = this.speciesPanel;
    p.innerHTML = '';
    const sel = document.createElement('select');
    sel.className = 'dev-select';
    SPECIES.forEach((s, i) => {
      const o = document.createElement('option');
      o.value = i; o.textContent = s.name; sel.appendChild(o);
    });
    if (this._selIdx == null || this._selIdx >= SPECIES.length) this._selIdx = 0;
    sel.value = this._selIdx;
    p.appendChild(sel);

    const fieldsBox = document.createElement('div');
    p.appendChild(fieldsBox);
    const render = (idx) => {
      this._selIdx = idx;
      fieldsBox.innerHTML = '';
      const sp = SPECIES[idx];
      // Spawn injector
      const act = document.createElement('div'); act.className = 'dev-actions';
      [25, 100].forEach(n => {
        const b = document.createElement('button');
        b.className = 'dev-btn'; b.textContent = `Spawn +${n}`;
        b.addEventListener('click', () => this.game.spawnLive(idx, n));
        act.appendChild(b);
      });
      fieldsBox.appendChild(act);
      const fields = sp.kind === 'plant' ? PLANT_FIELDS : ANIMAL_FIELDS;
      fields.forEach(([k, min, max, step]) => {
        this.slider(fieldsBox, k, () => sp[k] ?? 0, v => { sp[k] = v; }, min, max, step);
      });
      const wx = document.createElement('div'); wx.innerHTML = '<h4>Harvest value</h4>';
      fieldsBox.appendChild(wx);
      WEXLE_FIELDS.forEach(([k, min, max, step]) => {
        this.slider(wx, k, () => sp.wexle[k] ?? 0, v => { sp.wexle[k] = v; }, min, max, step);
      });
    };
    sel.addEventListener('change', () => render(parseInt(sel.value, 10)));
    render(this._selIdx);
  }

  // ---- Create tab -------------------------------------------------------
  buildCreate() {
    const p = this.createPanel;
    p.innerHTML = '<h4>New species</h4>';
    const mk = (label, el) => {
      const row = document.createElement('label'); row.className = 'dev-field';
      const s = document.createElement('span'); s.className = 'dev-key'; s.textContent = label;
      row.append(s, el); p.appendChild(row); return el;
    };
    const name = mk('Name', Object.assign(document.createElement('input'), { type: 'text', value: 'Newt' }));
    const color = mk('Color', Object.assign(document.createElement('input'), { type: 'color', value: '#7fd0ff' }));
    const kind = mk('Kind', document.createElement('select'));
    ['animal', 'plant'].forEach(k => kind.appendChild(Object.assign(document.createElement('option'), { value: k, textContent: k })));
    const habitat = mk('Habitat', document.createElement('select'));
    Object.keys(HABITAT_PRESETS).forEach(k => habitat.appendChild(Object.assign(document.createElement('option'), { value: k, textContent: k })));
    habitat.value = 'Land (any)';
    const initial = mk('Initial count', Object.assign(document.createElement('input'), { type: 'number', value: 80, min: 0, max: 3000 }));

    const dietWrap = document.createElement('div');
    dietWrap.innerHTML = '<h4>Diet (animals)</h4>';
    this.dietBox = document.createElement('div'); this.dietBox.className = 'dev-diet';
    dietWrap.appendChild(this.dietBox);
    p.appendChild(dietWrap);
    this.refreshDietChecks();

    const create = document.createElement('button');
    create.className = 'dev-btn dev-create'; create.textContent = 'Create & restart world';
    const note = document.createElement('p'); note.className = 'hm-hint';
    note.textContent = 'Creating restarts the world so the new species seeds in.';
    create.addEventListener('click', () => {
      const diet = [...this.dietBox.querySelectorAll('input:checked')].map(c => c.value);
      try {
        this.game.createAndApply({
          name: name.value.trim() || 'Newt',
          color: color.value,
          kind: kind.value,
          habitat: HABITAT_PRESETS[habitat.value],
          diet: kind.value === 'animal' ? diet : [],
          initial: parseInt(initial.value, 10) || 0,
        });
        note.textContent = `Created “${name.value}”. World restarted.`;
      } catch (e) {
        note.textContent = `Couldn't create: ${e.message}`;
      }
    });
    p.append(create, note);
  }

  refreshDietChecks() {
    if (!this.dietBox) return;
    this.dietBox.innerHTML = '';
    SPECIES.forEach(sp => {
      const lab = document.createElement('label'); lab.className = 'dev-check';
      const cb = document.createElement('input'); cb.type = 'checkbox'; cb.value = sp.id;
      lab.append(cb, document.createTextNode(' ' + sp.name));
      this.dietBox.appendChild(lab);
    });
  }
}
