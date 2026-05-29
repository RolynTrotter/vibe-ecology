// ===========================================================================
//  Graphs — rolling population history + a small multi-line chart.
// ===========================================================================
import { SPECIES, CONFIG } from './config.js';

export class PopulationGraph {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.len = CONFIG.graph.historyLength;
    // One ring buffer per species.
    this.history = Array.from({ length: SPECIES.length },
      () => new Float32Array(this.len));
    this.head = 0;
    this.filled = 0;
  }

  sample(counts) {
    for (let sp = 0; sp < SPECIES.length; sp++) {
      this.history[sp][this.head] = counts[sp];
    }
    this.head = (this.head + 1) % this.len;
    if (this.filled < this.len) this.filled++;
  }

  resize(w, h, dpr) {
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.w = w; this.h = h;
  }

  draw() {
    const ctx = this.ctx, w = this.w, h = this.h;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(12,16,22,0.78)';
    ctx.fillRect(0, 0, w, h);
    if (this.filled < 2) return;

    // Max across all series for vertical scaling (log-ish via sqrt to keep
    // both rare predators and abundant plants legible).
    let max = 1;
    for (let sp = 0; sp < SPECIES.length; sp++) {
      const buf = this.history[sp];
      for (let k = 0; k < this.filled; k++) if (buf[k] > max) max = buf[k];
    }
    const scaleY = (v) => h - 4 - (Math.sqrt(v) / Math.sqrt(max)) * (h - 8);
    const n = this.filled;
    const step = (w - 4) / (n - 1);
    const start = (this.head - this.filled + this.len) % this.len;

    for (let sp = 0; sp < SPECIES.length; sp++) {
      const buf = this.history[sp];
      ctx.strokeStyle = SPECIES[sp].color;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (let k = 0; k < n; k++) {
        const v = buf[(start + k) % this.len];
        const x = 2 + k * step;
        const y = scaleY(v);
        if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }
}
