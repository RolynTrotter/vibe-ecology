// ===========================================================================
//  main — bootstraps the simulation, render loop, input, and HUD.
//  Sim ticks run on a fixed timestep (decoupled from render) so a given
//  speed setting behaves the same regardless of frame rate.
// ===========================================================================
import { CONFIG } from './config.js';
import { Simulation } from './simulation.js';
import { Camera } from './camera.js';
import { Renderer } from './renderer.js';
import { attachInput } from './input.js';
import { PopulationGraph } from './graphs.js';
import { HarvestController } from './harvest.js';
import { UI } from './ui.js';

const SPEEDS = [1, 2, 4, 8];

class Game {
  constructor() {
    this.canvas = document.getElementById('view');
    this.minimap = document.getElementById('minimap');
    this.graphCanvas = document.getElementById('graph');

    this.sim = new Simulation();
    this.camera = new Camera(this.sim.world);
    this.renderer = new Renderer(this.canvas, this.minimap, this.sim.world);
    this.graph = new PopulationGraph(this.graphCanvas);
    this.harvest = new HarvestController();
    attachInput(this.canvas, this.camera, this.minimap);

    this.running = true;
    this.speedIdx = 0;
    this.graphShown = true;
    this.accumulator = 0;
    this.lastTime = performance.now();
    this.fps = 0;
    this._fpsAccum = 0;
    this._fpsFrames = 0;
    this._sinceSample = 0;

    this.ui = new UI({
      onTogglePlay: () => (this.running = !this.running),
      onSpeed: () => {
        this.speedIdx = (this.speedIdx + 1) % SPEEDS.length;
        return SPEEDS[this.speedIdx];
      },
      onReset: () => this.reset(),
      onToggleGraph: () => {
        this.graphShown = !this.graphShown;
        this.graphCanvas.style.display = this.graphShown ? 'block' : 'none';
        return this.graphShown;
      },
    }, this.harvest);

    this.resize();
    this.camera.fitToWidth(0.6);
    window.addEventListener('resize', () => this.resize());
    requestAnimationFrame(this.frame.bind(this));
  }

  reset() {
    this.sim = new Simulation();
    this.camera.world = this.sim.world;
    this.renderer = new Renderer(this.canvas, this.minimap, this.sim.world);
    this.graph = new PopulationGraph(this.graphCanvas);
    this.resize();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.resize(w, h, dpr);
    this.camera.setViewport(w, h);
    this.camera.clamp();
    // Graph sized as a bottom strip.
    const gw = Math.min(360, w - 20);
    this.graph.resize(gw, 110, dpr);
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
        this.accumulator -= tickDt;
        if (++this._sinceSample >= CONFIG.graph.sampleEvery) {
          this._sinceSample = 0;
          this.graph.sample(this.sim.store.counts);
        }
      }
    }

    this.renderer.draw(this.sim, this.camera);
    if (this.graphShown) this.graph.draw();

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
