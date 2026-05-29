// ===========================================================================
//  main — bootstraps the simulation, render loop, input, and HUD.
//  Sim ticks run on a fixed timestep (decoupled from render) so a given
//  speed setting behaves the same regardless of frame rate.
// ===========================================================================
import { CONFIG, SPECIES, createSpecies } from './config.js';
import { Simulation } from './simulation.js';
import { Camera } from './camera.js';
import { Renderer } from './renderer.js';
import { attachInput } from './input.js';
import { PopulationGraph } from './graphs.js';
import { HarvestController } from './harvest.js';
import { Colony } from './colony.js';
import { UI } from './ui.js';
import { DevPanel } from './dev.js';

const SPEEDS = [1, 2, 4, 8];

class Game {
  constructor() {
    this.canvas = document.getElementById('view');
    this.minimap = document.getElementById('minimap');

    this.sim = new Simulation();
    this.camera = new Camera(this.sim.world);
    this.renderer = new Renderer(this.canvas, this.minimap, this.sim.world);
    this.harvest = new HarvestController();
    this.colony = new Colony();
    attachInput(this.canvas, this.camera, this.minimap);

    this.running = true;
    this.speedIdx = 0;
    this.accumulator = 0;
    this.lastTime = performance.now();
    this.fps = 0;
    this._fpsAccum = 0;
    this._fpsFrames = 0;
    this._sinceSample = 0;
    this._gw = 0; this._gh = 0; // last graph canvas size

    this.ui = new UI({
      onTogglePlay: () => (this.running = !this.running),
      onSpeed: () => {
        this.speedIdx = (this.speedIdx + 1) % SPEEDS.length;
        return SPEEDS[this.speedIdx];
      },
      onReset: () => this.reset(),
    }, this.harvest, this.colony, this.sim.world);

    // The population graph lives inside the Stats > Over time tab; the UI owns
    // the canvas, we own the rolling history.
    this.graph = new PopulationGraph(this.ui.graphCanvas);
    this.dev = new DevPanel(this);

    this.resize();
    this.camera.fitToWidth(0.6);
    window.addEventListener('resize', () => this.resize());
    requestAnimationFrame(this.frame.bind(this));
  }

  reset() {
    this.sim = new Simulation();
    this.camera.world = this.sim.world;
    this.renderer = new Renderer(this.canvas, this.minimap, this.sim.world);
    this.graph = new PopulationGraph(this.ui.graphCanvas);
    this.colony = new Colony();
    this.ui.colony = this.colony;
    this.ui.world = this.sim.world; // keep the Stats > Terrain tab in sync
    this.resize();
  }

  // ---- dev tools hooks --------------------------------------------------
  // Inject `n` more individuals of a species into the live world.
  spawnLive(idx, n) { this.sim.spawnSpecies(SPECIES[idx], n); }

  // Rebuild the world with the current CONFIG (e.g. after a seed change).
  regenerate() { this.reset(); }

  // Add a new species, then restart the world so it seeds in and every
  // per-species structure is rebuilt at the new roster size.
  createAndApply(def) {
    createSpecies(def);
    // Harvest arrays are sized to the roster, so rebuild it at the new size.
    this.harvest = new HarvestController();
    this.ui.harvest = this.harvest;
    this.reset();             // recreates sim/renderer/graph/colony, re-seeds
    this.ui.rebuildSpecies(); // rebuild per-species DOM at the new roster size
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.resize(window.innerWidth, window.innerHeight, dpr);
    this.camera.setViewport(window.innerWidth, window.innerHeight);
    this.camera.clamp();
    this._gw = 0; // force the in-menu graph to re-fit on next draw
  }

  frame(now) {
    const dt = Math.min(0.1, (now - this.lastTime) / 1000);
    this.lastTime = now;

    // Fixed-timestep simulation, scaled by the speed multiplier.
    if (this.running) {
      const tickDt = 1 / CONFIG.sim.ticksPerSecond;
      this.accumulator += dt * SPEEDS[this.speedIdx];
      let budget = 12; // cap catch-up steps so we never spiral on a slow frame
      while (this.accumulator >= tickDt && budget-- > 0) {
        this.sim.step();
        this.harvest.step(this.sim, tickDt);
        this.colony.step(this.harvest, tickDt);
        this.accumulator -= tickDt;
        if (++this._sinceSample >= CONFIG.graph.sampleEvery) {
          this._sinceSample = 0;
          this.graph.sample(this.sim.store.counts);
        }
      }
    }

    this.renderer.draw(this.sim, this.camera);

    // Draw the graph only while its tab is on screen, re-fitting to its size.
    if (this.ui.isGraphVisible()) {
      const c = this.graph.canvas;
      const cw = c.clientWidth, ch = 140;
      if (cw && (cw !== this._gw || ch !== this._gh)) {
        this.graph.resize(cw, ch, Math.min(window.devicePixelRatio || 1, 2));
        c.style.height = ch + 'px';
        this._gw = cw; this._gh = ch;
      }
      this.graph.draw();
    }

    // FPS (smoothed over ~0.5s).
    this._fpsAccum += dt; this._fpsFrames++;
    if (this._fpsAccum >= 0.5) {
      this.fps = this._fpsFrames / this._fpsAccum;
      this._fpsAccum = 0; this._fpsFrames = 0;
    }
    this.ui.update(this.sim, this.fps);

    requestAnimationFrame(this.frame.bind(this));
  }
}

window.addEventListener('DOMContentLoaded', () => new Game());

// Register the service worker for offline / installable PWA behaviour.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
