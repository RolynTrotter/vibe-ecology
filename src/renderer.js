// ===========================================================================
//  Renderer — draws terrain (pre-rendered once) and culled entities each
//  frame onto the main canvas, plus the minimap with a viewport box.
// ===========================================================================
import { SPECIES, TERRAIN, TERRAIN_INFO, NUM_SPECIES, classifyDither } from './config.js';

// 4x4 Bayer ordered-dither matrix, normalized to (0,1).
const BAYER4 = [
  0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5,
].map(v => (v + 0.5) / 16);

export class Renderer {
  constructor(canvas, minimap, world) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.minimap = minimap;
    this.mmCtx = minimap.getContext('2d');
    this.world = world;

    // Cache species colors as packed RGBA for fast pixel writes if needed.
    this.colors = SPECIES.map(s => s.color);

    this.buildTerrainLayer();
    this.buildMinimapLayer();
  }

  // Offscreen canvas: one pixel per grid cell, baked once. Type boundaries are
  // ordered-dithered (stippled) toward the neighbouring type for retro edges.
  buildTerrainLayer() {
    const w = this.world;
    const off = document.createElement('canvas');
    off.width = w.width; off.height = w.height;
    const octx = off.getContext('2d');
    const img = octx.createImageData(w.width, w.height);
    const data = img.data;
    const palette = TERRAIN_INFO.map(t => hexToRgb(t.color));
    const [elev, moist, rock] = w.fields;
    for (let y = 0; y < w.height; y++) {
      for (let x = 0; x < w.width; x++) {
        const i = w.idx(x, y);
        const bayer = BAYER4[(y & 3) * 4 + (x & 3)];
        let c;
        if (w.terrain[i] === TERRAIN.CORAL) {
          // Stipple coral over shallow water for a reef texture.
          c = palette[bayer < 0.55 ? TERRAIN.CORAL : TERRAIN.SHALLOW_WATER];
        } else {
          const [primary, secondary, mix] = classifyDither(elev[i], moist[i], rock[i]);
          c = palette[mix > 0 && bayer < mix ? secondary : primary];
        }
        const o = i * 4;
        data[o] = c.r; data[o + 1] = c.g; data[o + 2] = c.b; data[o + 3] = 255;
      }
    }
    octx.putImageData(img, 0, 0);
    this.terrainLayer = off;
  }

  buildMinimapLayer() {
    const w = this.world;
    const off = document.createElement('canvas');
    off.width = w.width; off.height = w.height;
    const octx = off.getContext('2d');
    const img = octx.createImageData(w.width, w.height);
    const data = img.data;
    const palette = TERRAIN_INFO.map(t => hexToRgb(t.minimap));
    for (let i = 0; i < w.terrain.length; i++) {
      const c = palette[w.terrain[i]];
      const o = i * 4;
      data[o] = c.r; data[o + 1] = c.g; data[o + 2] = c.b; data[o + 3] = 255;
    }
    octx.putImageData(img, 0, 0);
    this.minimapLayer = off;
  }

  resize(w, h, dpr) {
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.dpr = dpr;
  }

  draw(sim, camera) {
    const ctx = this.ctx;
    const W = camera.viewW, H = camera.viewH;
    ctx.clearRect(0, 0, W, H);

    // --- Terrain (single scaled blit) ---
    const z = camera.zoom;
    const ox = camera.worldToScreenX(0);
    const oy = camera.worldToScreenY(0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.terrainLayer, 0, 0, this.world.width, this.world.height,
      ox, oy, this.world.width * z, this.world.height * z);

    // --- Entities (culled to view) ---
    const s = sim.store;
    const b = camera.visibleBounds();
    const pad = 2;
    const x0 = b.x0 - pad, x1 = b.x1 + pad, y0 = b.y0 - pad, y1 = b.y1 + pad;
    const n = s.highWater;

    // Batch by species so we set fillStyle once per species (big win).
    for (let sp = 0; sp < NUM_SPECIES; sp++) {
      if (s.counts[sp] === 0) continue;
      const def = SPECIES[sp];
      ctx.fillStyle = def.color;
      const radius = Math.max(1, def.size * z * 0.5);
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        if (!s.alive[i] || s.species[i] !== sp) continue;
        const wx = s.x[i], wy = s.y[i];
        if (wx < x0 || wx > x1 || wy < y0 || wy > y1) continue;
        const px = (wx - camera.x) * z + W / 2;
        const py = (wy - camera.y) * z + H / 2;
        ctx.moveTo(px + radius, py);
        ctx.arc(px, py, radius, 0, TWO_PI);
      }
      ctx.fill();
    }

    this.drawMinimap(camera);
  }

  drawMinimap(camera) {
    const mm = this.minimap, ctx = this.mmCtx;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.minimapLayer, 0, 0, mm.width, mm.height);
    // Viewport rectangle.
    const b = camera.visibleBounds();
    const sx = mm.width / this.world.width, sy = mm.height / this.world.height;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(b.x0 * sx, b.y0 * sy,
      (b.x1 - b.x0) * sx, (b.y1 - b.y0) * sy);
  }
}

const TWO_PI = Math.PI * 2;

function hexToRgb(hex) {
  const v = parseInt(hex.slice(1), 16);
  return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
}
