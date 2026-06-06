// ===========================================================================
//  Renderer — bakes static map layers once (textured terrain + field maps),
//  then each frame blits the selected layer and draws culled, kind-filtered
//  entities, plus the minimap.
// ===========================================================================
import { SPECIES, CONFIG, TERRAIN, TERRAIN_INFO, classifyDither } from './config.js';
import { ENTITY_STATE } from './entities.js';
import { terrainTexel, fieldRamp } from './textures.js';

const TWO_PI = Math.PI * 2;
const TEX_SCALE = 4; // device px per cell in the textured terrain layer

// Plants draw larger than their sim `size` so neighbouring individuals overlap
// into mats of foliage (a "lush" read) rather than scattered specks. Animals
// keep the tighter 0.5 factor so they stay legible as individuals. These are
// purely visual — `size` itself is left alone because the sim couples to it
// (grazer eat-distance, offspring spawn offset).
const PLANT_RENDER_SCALE = 1.15;
const PLANT_MIN_PX = 1.8; // floor so a plant never collapses to a single speck
const ANIMAL_RENDER_SCALE = 0.5;

// Back-to-front draw order so the scene reads with depth: ground plants, then
// the critters walking among them, then tree canopies overhead, then birds on
// top. The coral overlay is blitted between animals and canopy so reef-bound
// fish look tucked into the coral. `canopy`/`aerial` are species flags (config).
const LAYER = { GROUND_PLANT: 0, GROUND_ANIMAL: 1, CANOPY: 2, AERIAL: 3 };
function renderLayerOf(def) {
  if (def.kind === 'plant') return def.canopy ? LAYER.CANOPY : LAYER.GROUND_PLANT;
  return def.aerial ? LAYER.AERIAL : LAYER.GROUND_ANIMAL;
}

// Childhood: the young render smaller and paler, growing into the adult form by
// maturity. JUVENILE_MIN is the fraction of adult size at birth.
const JUVENILE_MIN = 0.45;
const JUVENILE_TINT = 0.45;    // how far a juvenile's colour is washed toward white
const CORPSE_COLOR = '#7d7d82'; // grey carrion, alpha-faded by how far it's rotted

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
    this.coralOverlay = this.bakeCoralOverlay();
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

  // Just the coral stipple on a transparent canvas, matching the coral texels
  // baked into the terrain. Blitted over the water critters each frame so fish
  // sheltering on a reef look tucked inside it (coral is their refuge).
  bakeCoralOverlay() {
    const w = this.world, W = w.width, H = w.height, TS = TEX_SCALE;
    const cw = W * TS, ch = H * TS;
    const off = document.createElement('canvas');
    off.width = cw; off.height = ch;
    const octx = off.getContext('2d');
    const img = octx.createImageData(cw, ch); // alpha defaults to 0 (transparent)
    const data = img.data;
    for (let py = 0; py < ch; py++) {
      const cy = (py / TS) | 0;
      for (let px = 0; px < cw; px++) {
        const cx = (px / TS) | 0;
        if (w.terrain[cy * W + cx] !== TERRAIN.CORAL) continue;
        const bayer = BAYER4[(py & 3) * 4 + (px & 3)];
        if (bayer >= 0.55) continue;                 // only the coral-coloured texels
        const c = terrainTexel(TERRAIN.CORAL, px, py);
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
    const rot = camera.rot || 0;
    const ox = camera.worldToScreenX(0);
    const oy = camera.worldToScreenY(0);
    const layer = this.viewMode === 'terrain'
      ? this.terrainLayer : this.fieldLayers[VIEW_FIELD[this.viewMode]];

    // Everything in the world (terrain + entities) is drawn under the view
    // rotation, pivoting about the screen centre (== the camera focus). The
    // minimap stays upright, outside this transform.
    ctx.save();
    if (rot) { ctx.translate(W / 2, H / 2); ctx.rotate(rot); ctx.translate(-W / 2, -H / 2); }

    // Crisp texture for terrain; smooth gradients for the analysis maps (and a
    // smooth resample when rotated, since nearest-neighbour rotation aliases).
    ctx.imageSmoothingEnabled = this.viewMode !== 'terrain' || !!rot;
    ctx.drawImage(layer, 0, 0, layer.width, layer.height,
      ox, oy, this.world.width * z, this.world.height * z);

    // --- Entities, drawn back-to-front and clipped to the map rectangle so
    //     nothing (including reef coral) spills past the world edge. ---
    const s = sim.store;
    const b = camera.visibleBounds();
    const pad = 2;
    const x0 = b.x0 - pad, x1 = b.x1 + pad, y0 = b.y0 - pad, y1 = b.y1 + pad;
    const n = s.highWater;

    const sx = camera.x, sy = camera.y;
    const visible = (wx, wy) => wx >= x0 && wx <= x1 && wy >= y0 && wy <= y1;
    // Append a body outline (circle, or triangle for the odd-one-out) to the
    // current path at screen position (px,py) with the given radius.
    const shape = (px, py, r, triangle) => {
      if (triangle) {
        const h = r * 1.4;
        ctx.moveTo(px, py - h);
        ctx.lineTo(px - r, py + r * 0.8);
        ctx.lineTo(px + r, py + r * 0.8);
        ctx.closePath();
      } else {
        ctx.moveTo(px + r, py);
        ctx.arc(px, py, r, 0, TWO_PI);
      }
    };

    const drawPlants = (wantLayer) => {
      if (!this.showPlants) return;
      for (let sp = 0; sp < SPECIES.length; sp++) {
        if (s.counts[sp] === 0) continue;
        const def = SPECIES[sp];
        if (def.kind !== 'plant' || renderLayerOf(def) !== wantLayer) continue;
        ctx.fillStyle = def.color;
        const radius = Math.max(PLANT_MIN_PX, def.size * z * PLANT_RENDER_SCALE);
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          if (!s.alive[i] || s.species[i] !== sp) continue;
          const wx = s.x[i], wy = s.y[i];
          if (!visible(wx, wy)) continue;
          shape((wx - sx) * z + W / 2, (wy - sy) * z + H / 2, radius, false);
        }
        ctx.fill();
      }
    };

    const drawAnimals = (wantLayer) => {
      if (!this.showAnimals) return;
      for (let sp = 0; sp < SPECIES.length; sp++) {
        if (s.counts[sp] === 0) continue;
        const def = SPECIES[sp];
        if (def.kind === 'plant' || renderLayerOf(def) !== wantLayer) continue;
        const tri = def.shape === 'triangle';
        const baseR = Math.max(1, def.size * z * ANIMAL_RENDER_SCALE);
        const ma = def.matureAge || 1;
        // Adults (full size, full colour). Then juveniles (smaller, paler) in a
        // second pass so each can use its own fill style.
        ctx.fillStyle = def.color;
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          if (!s.alive[i] || s.species[i] !== sp) continue;
          if (s.state[i] !== ENTITY_STATE.ALIVE || s.age[i] < ma) continue;
          const wx = s.x[i], wy = s.y[i];
          if (!visible(wx, wy)) continue;
          shape((wx - sx) * z + W / 2, (wy - sy) * z + H / 2, baseR, tri);
        }
        ctx.fill();

        ctx.fillStyle = lightenHex(def.color, JUVENILE_TINT);
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          if (!s.alive[i] || s.species[i] !== sp) continue;
          if (s.state[i] !== ENTITY_STATE.ALIVE || s.age[i] >= ma) continue;
          const wx = s.x[i], wy = s.y[i];
          if (!visible(wx, wy)) continue;
          const f = s.age[i] / ma;
          const r = baseR * (JUVENILE_MIN + (1 - JUVENILE_MIN) * f);
          shape((wx - sx) * z + W / 2, (wy - sy) * z + H / 2, r, tri);
        }
        ctx.fill();
      }
    };

    // Old-age carcasses: grey, fading out as they rot. Few enough to draw each
    // with its own alpha.
    const drawCorpses = () => {
      if (!this.showAnimals) return;
      const fade = CONFIG.sim.decayTicks || 1;
      ctx.fillStyle = CORPSE_COLOR;
      for (let i = 0; i < n; i++) {
        if (!s.alive[i] || s.state[i] !== ENTITY_STATE.DECAYING) continue;
        const wx = s.x[i], wy = s.y[i];
        if (!visible(wx, wy)) continue;
        const def = SPECIES[s.species[i]];
        const r = Math.max(1, def.size * z * ANIMAL_RENDER_SCALE);
        ctx.globalAlpha = Math.max(0.12, s.decay[i] / fade);
        ctx.beginPath();
        shape((wx - sx) * z + W / 2, (wy - sy) * z + H / 2, r, false);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };

    ctx.save();
    ctx.beginPath();
    ctx.rect(ox, oy, this.world.width * z, this.world.height * z);
    ctx.clip();

    drawPlants(LAYER.GROUND_PLANT);
    drawCorpses();                 // carrion lies on the ground, beneath the living
    drawAnimals(LAYER.GROUND_ANIMAL);
    // Coral re-stamped over the water critters (terrain view only) — fish read
    // as hidden in the reef. Crisp blit to match the baked terrain stipple.
    if (this.viewMode === 'terrain') {
      ctx.imageSmoothingEnabled = !!rot;
      ctx.drawImage(this.coralOverlay, 0, 0, this.coralOverlay.width, this.coralOverlay.height,
        ox, oy, this.world.width * z, this.world.height * z);
    }
    drawPlants(LAYER.CANOPY);     // tree canopies over the ground critters
    drawAnimals(LAYER.AERIAL);    // birds (and Necrow) on top

    ctx.restore();               // end world-rect clip

    ctx.restore();               // end view rotation
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

// Wash a hex colour toward white by `amt` (0..1); used to pale the juveniles.
function lightenHex(hex, amt) {
  const { r, g, b } = hexToRgb(hex);
  const mix = (c) => Math.round(c + (255 - c) * amt);
  return `rgb(${mix(r)},${mix(g)},${mix(b)})`;
}
