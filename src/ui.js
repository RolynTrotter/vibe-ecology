// ===========================================================================
//  UI — builds the species readout, wires the control buttons, and refreshes
//  the HUD (populations, score, tick, fps) each frame.
// ===========================================================================
import { SPECIES, TERRAIN_INFO } from './config.js';
import { ecosystemHealth } from './score.js';

export class UI {
  constructor(handlers) {
    this.handlers = handlers; // { onTogglePlay, onSpeed, onReset, onToggleGraph }
    this.buildSpeciesList();
    this.buildLegend();
    this.wireControls();
    this.scoreEl = document.getElementById('score');
    this.tickEl = document.getElementById('tick');
    this.fpsEl = document.getElementById('fps');
    this.totalEl = document.getElementById('total');
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
  }
}
