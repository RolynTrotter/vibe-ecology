// ===========================================================================
//  Renderer — bakes static map layers once (textured terrain + field maps),
//  then each frame blits the selected layer and draws culled, kind-filtered
//  entities, plus the minimap.
// ===========================================================================
import { SPECIES, TERRAIN, TERRAIN_INFO, classifyDither } from './config.js';
import { terrainTexel, fieldRamp } from './textures.js';

const TWO_PI = Math.PI * 2;
const TEX_SCALE = 4; // device px per cell in the textured terrain layer

// 4x4 Bayer ordered-dither matrix, normalized to (0,1).
const BAYER4 = [
  0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5,
].map(v => (v + 0.5) / 16);

const VIEW_FIELD = { elevation: 0, moisture: 1, rockiness: 2 };

export class Renderer {
  constructor(canvas, minimap, world) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.minimap = minimap;
    this.mmCtx = minimap.getContext('2d');
    this.world = world;

    // Display options (driven by the Map menu).
    this.viewMode = 'terrain';   // 'terrain' | 'elevation' | 'moisture' | 'rockiness'
    this.showPlants = true;
    this.showAnimals = true;

    this.buildLayers();
  }

  setView(mode) { if (mode) this.viewMode = mode; }
  setShow(plants, animals) { this.showPlants = plants; this.showAnimals = animals; }

  buildLayers() {
    this.terrainLayer = this.bakeTerrain();
    this.fieldLayers = [0, 1, 2].map(f => this.bakeField(f));
    this.minimapLayer = this.bakeMinimap();
  }

  // Hi-res textured terrain with dithered type boundaries, baked once.
  bakeTerrain() {
    const w = this.world, W = w.width, H = w.height, TS = TEX_SCALE;
    const cw = W * TS, ch = H * TS;
    const off = document.createElement('canvas');
    off.width = cw; off.height = ch;
    const octx = off.getContext('2d');
    const img = octx.createImageData(cw, ch);
    const data = img.data;
    const [elev, moist, rock] = w.fields;
    const bil = (F, fx, fy) => {
      let x0 = fx | 0, y0 = fy | 0;
      let x1 = x0 + 1 >= W ? W - 1 : x0 + 1;
      let y1 = y0 + 1 >= H ? H - 1 : y0 + 1;
      const tx = fx - x0, ty = fy - y0;
      const top = F[y0 * W + x0] * (1 - tx) + F[y0 * W + x1] * tx;
      const bot = F[y1 * W + x0] * (1 - tx) + F[y1 * W + x1] * tx;
      return top * (1 - ty) + bot * ty;
    };
    for (let py = 0; py < ch; py++) {
      const fy = py / TS, cy = fy | 0;
      for (let px = 0; px < cw; px++) {
        const fx = px / TS, cx = fx | 0;
        const bayer = BAYER4[(py & 3) * 4 + (px & 3)];
        let type;
        if (w.terrain[cy * W + cx] === TERRAIN.CORAL) {
          type = bayer < 0.55 ? TERRAIN.CORAL : TERRAIN.SHALLOW_WATER;
        } else {
          const [p, s, mix] = classifyDither(bil(elev, fx, fy), bil(moist, fx, fy), bil(rock, fx, fy));
          type = mix > 0 && bayer < mix ? s : p;
        }
        const c = terrainTexel(type, px, py);
        const o = (py * cw + px) * 4;
        data[o] = c.r; data[o + 1] = c.g; data[o + 2] = c.b; data[o + 3] = 255;
      }
    }
    octx.putImageData(img, 0, 0);
    return off;
  }

  // 1px/cell color-ramped map of a continuous field (drawn smoothed).
  bakeField(field) {
    const w = this.world;
    const off = document.createElement('canvas');
    off.width = w.width; off.height = w.height;
    const octx = off.getContext('2d');
    const img = octx.createImageData(w.width, w.height);
    const data = img.data;
    const F = w.fields[field];
    for (let i = 0; i < F.length; i++) {
      const c = fieldRamp(field, F[i]);
      const o = i * 4;
      data[o] = c.r; data[o + 1] = c.g; data[o + 2] = c.b; data[o + 3] = 255;
    }
    octx.putImageData(img, 0, 0);
    return off;
  }

  bakeMinimap() {
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
    return off;
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

    // --- Selected map layer (single scaled blit) ---
    const z = camera.zoom;
    const ox = camera.worldToScreenX(0);
    const oy = camera.worldToScreenY(0);
    const layer = this.viewMode === 'terrain'
      ? this.terrainLayer : this.fieldLayers[VIEW_FIELD[this.viewMode]];
    // Crisp texture for terrain; smooth gradients for the analysis maps.
    ctx.imageSmoothingEnabled = this.viewMode !== 'terrain';
    ctx.drawImage(layer, 0, 0, layer.width, layer.height,
      ox, oy, this.world.width * z, this.world.height * z);

    // --- Entities (culled to view, filtered by kind) ---
    const s = sim.store;
    const b = camera.visibleBounds();
    const pad = 2;
    const x0 = b.x0 - pad, x1 = b.x1 + pad, y0 = b.y0 - pad, y1 = b.y1 + pad;
    const n = s.highWater;

    for (let sp = 0; sp < SPECIES.length; sp++) {
      if (s.counts[sp] === 0) continue;
      const def = SPECIES[sp];
      if (def.kind === 'plant' ? !this.showPlants : !this.showAnimals) continue;
      ctx.fillStyle = def.color;
      const radius = Math.max(1, def.size * z * 0.5);
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        if (!s.alive[i] || s.species[i] !== sp) continue;
        const wx = s.x[i], wy = s.y[i];
        if (wx < x0 || wx > x1 || wy < y0 || wy > y1) continue;
        const pxs = (wx - camera.x) * z + W / 2;
        const pys = (wy - camera.y) * z + H / 2;
        ctx.moveTo(pxs + radius, pys);
        ctx.arc(pxs, pys, radius, 0, TWO_PI);
      }
      ctx.fill();
    }

    this.drawMinimap(camera);
  }

  drawMinimap(camera) {
    const mm = this.minimap, ctx = this.mmCtx;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.minimapLayer, 0, 0, mm.width, mm.height);
    const b = camera.visibleBounds();
    const sx = mm.width / this.world.width, sy = mm.height / this.world.height;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(b.x0 * sx, b.y0 * sy, (b.x1 - b.x0) * sx, (b.y1 - b.y0) * sy);
  }
}

function hexToRgb(hex) {
  const v = parseInt(hex.slice(1), 16);
  return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
}
