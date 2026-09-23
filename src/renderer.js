// ===========================================================================
//  Renderer — draws the world as a sticker card floating in space: the painted
//  terrain (a worker-baked tile pyramid, terrain/tiles.js) or an analysis field
//  map, twinkling water glints, then culled, y-sorted life sprites, plus the
//  minimap.
// ===========================================================================
import { SPECIES, CONFIG, TERRAIN, TERRAIN_INFO } from './config.js';
import { ENTITY_STATE } from './entities.js';
import { fieldRamp } from './textures.js';
import { TerrainTiles } from './terrain/tiles.js';
import { BANK, ANIM, animalPose, plantPose, mipFor, FIRST_DETAIL_MIP } from './sprites/atlas.js';
import { spriteFor, ANCHOR } from './sprites/critters.js';


// ---- Life sprites -----------------------------------------------------------
// Every organism is a baked sprite billboard (src/sprites), sized from its sim
// `size` × the sprite's `box`, anchored at its feet, and y-sorted within its
// layer so nearer critters overlap farther ones. Purely visual: `size` itself
// is left alone because the sim couples to it.

// Back-to-front layers: flat ground cover, then everything standing on the
// ground (plants, critters, carcasses — y-sorted together), then tree
// canopies, then fliers. Swimmers over coral draw translucent (REEF_ALPHA) so
// they look tucked into the reef.
const LAYER = { DECAL: 0, GROUND: 1, CANOPY: 2, AERIAL: 3 };
function layerOf(def, sprite) {
  if (def.kind === 'plant') return sprite.flat ? LAYER.DECAL : def.canopy ? LAYER.CANOPY : LAYER.GROUND;
  return sprite.aerial || def.aerial ? LAYER.AERIAL : LAYER.GROUND;
}

// Level of detail, in device pixels of sprite box width. Below DOT_PX a species
// collapses to flat colour dots (one batched path — the old look, and cheap);
// between FADE_LO..FADE_HI the outline-free far blob crossfades into the inked
// sticker, so zooming never pops.
const DOT_PX = 6;
const FADE_LO = 22, FADE_HI = 34;
const FAR_MIP = FIRST_DETAIL_MIP - 1;   // the largest detail-0 mip (see atlas MIPS)
const WORLD_PAD = 5;             // cull margin (world units) for sprite overhang
const KEY_SPAN = 131072;         // > maxEntities: sort key = yBucket*KEY_SPAN + slot

const PLANT_SWAY_HZ = 0.35;
const IDLE_HZ = 0.6;
const MAX_PHASE_STEP = 0.3;      // cap walk-cycle advance per frame (fast-forward)

// Childhood: the young render smaller (and pre-tinted paler in the atlas),
// growing into the adult form by maturity. JUVENILE_MIN = size at birth.
const JUVENILE_MIN = 0.45;
const CORPSE_COLOR = '#7d7d82';  // far-zoom carrion dots
const REEF_ALPHA = 0.55;

// Mip + crossfade for a sprite `dev` device px wide. Below the band: the far
// blob alone. In the band: the far blob under the first inked mip at `fade`.
const LOD_OUT = { mip: 0, fade: 1 };
function lodFor(dev) {
  if (dev < FADE_LO) { LOD_OUT.mip = Math.min(mipFor(dev), FAR_MIP); LOD_OUT.fade = 1; }
  else if (dev < FADE_HI) { LOD_OUT.mip = FIRST_DETAIL_MIP; LOD_OUT.fade = smoothstep(FADE_LO, FADE_HI, dev); }
  else { LOD_OUT.mip = Math.max(mipFor(dev), FIRST_DETAIL_MIP); LOD_OUT.fade = 1; }
  return LOD_OUT;
}

const smoothstep = (a, b, v) => { const k = Math.min(1, Math.max(0, (v - a) / (b - a))); return k * k * (3 - 2 * k); };
const hash01 = (i) => (Math.imul(i + 1, 2654435761) >>> 0) / 4294967296;

const VIEW_FIELD = { elevation: 0, moisture: 1, rockiness: 2 };

// A plant's look from its state: sprout vs adult pose, growth scale, shape
// variant (or fullness, for fruit trees), and a mirrored half of the crowd.
// Returns the scale; the pose index is left in PLANT_POSE_OUT (no allocation).
let PLANT_POSE_OUT = 0;
function plantLook(s, i, def, sprite, h) {
  const V = sprite.variants || 1;
  const g = Math.min(1, s.age[i] / (def.matureAge || 1));
  const sprout = g < 0.5;
  let scale = sprout ? 0.55 + 0.9 * g : 0.75 + 0.5 * (g - 0.5);
  const e = Math.min(1, Math.max(0, s.energy[i] / (def.maxEnergy || 1)));
  scale *= 0.82 + 0.18 * e;                          // grazed plants look sparser
  const v = sprite.variantBy === 'energy' ? (e < 0.4 ? 0 : e < 0.75 ? 1 : 2) : (h * V) | 0;
  PLANT_POSE_OUT = plantPose(sprout, Math.min(v, V - 1), V, ((h * 977) | 0) & 1);
  return scale;
}

// ---- Far-zoom plant cache -------------------------------------------------
// Zoomed out, plants are most of the ~10k sprites on screen but too small for
// their sway to read. So species still below the top of the crossfade band are
// baked (crossfade included) into a world-space canvas at the current device
// px per world unit — capped, and upscaled a touch past the cap — and blitted
// in one go. It refreshes in the background — a slice of entities per frame into
// a back buffer, then a swap — so births, grazing and deaths show up within
// about a second without a frame hitch; only a big zoom jump rebuilds at once.
const CACHE_MAX_DIM = 2304;      // cap on the cache canvas's longest side (px)
const CACHE_REFRESH_S = 1.0;
const CACHE_CHUNK = 2500;        // entity slots scanned per frame while refreshing

class PlantCache {
  constructor(world) {
    this.world = world;
    this.front = null;           // { canvas, ps, mask }
    this.back = null;            // in-progress rebuild: { canvas, ps, mask, cursor }
    this.builtAt = 0;
  }

  // Which plant species should be cached at this pixel scale (bitmask).
  maskFor(r, ps) {
    if (!r.showPlants) return 0;
    let m = 0;
    for (let sp = 0; sp < SPECIES.length; sp++) {
      const def = SPECIES[sp];
      if (def.kind !== 'plant' || def.canopy) continue;
      if (def.size * spriteFor(def).box * ps < FADE_HI) m |= 1 << sp;
    }
    return m;
  }

  // Advance the cache for this frame; returns the mask of species it covers
  // (0 = cache not in use this frame).
  update(sim, r, realPs) {
    const mask = this.maskFor(r, realPs);
    if (!mask) { this.front = this.back = null; return 0; }
    const w = this.world;
    const ps = Math.min(realPs, CACHE_MAX_DIM / Math.max(w.width, w.height));
    this.realPs = realPs;
    const f = this.front;
    const now = performance.now() / 1000;
    const usable = f && f.mask === mask && Math.abs(f.ps / ps - 1) < 0.25;
    if (!usable) {
      // Big change: rebuild right now so the frame is correct.
      this.back = this.begin(ps, mask);
      this.step(sim, this.back, Infinity);
      this.front = this.back; this.back = null; this.builtAt = now;
      return mask;
    }
    if (!this.back && (now - this.builtAt > CACHE_REFRESH_S || f.ps !== ps)) {
      this.back = this.begin(ps, mask);
    }
    if (this.back) {
      if (this.back.mask !== mask) this.back = null;
      else if (this.step(sim, this.back, CACHE_CHUNK)) {
        this.front = this.back; this.back = null; this.builtAt = now;
      }
    }
    return this.front.mask;
  }

  begin(ps, mask) {
    const w = this.world;
    const cw = Math.ceil(w.width * ps), ch = Math.ceil(w.height * ps);
    // Recycle the retired front canvas when it's the right size.
    let canvas = this._spare;
    if (!canvas || canvas.width !== cw || canvas.height !== ch) {
      canvas = document.createElement('canvas');
      canvas.width = cw; canvas.height = ch;
    }
    this._spare = this.front && this.front.canvas !== canvas ? this.front.canvas : null;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, cw, ch);
    ctx.imageSmoothingEnabled = true;
    return { canvas, ctx, ps, mask, cursor: 0 };
  }

  // Draw up to `budget` entity slots into build `b`; true when finished.
  step(sim, b, budget) {
    const s = sim.store, n = s.highWater, ctx = b.ctx, ps = b.ps;
    const end = Math.min(n, b.cursor + budget);
    let lastSp = -1, sheet = null, far = null, k = 1, box = 0, def = null, sprite = null;
    for (let i = b.cursor; i < end; i++) {
      if (!s.alive[i] || s.state[i] !== ENTITY_STATE.ALIVE) continue;
      const sp = s.species[i];
      if (!(b.mask & (1 << sp))) continue;
      if (sp !== lastSp) {
        lastSp = sp; def = SPECIES[sp]; sprite = spriteFor(def);
        box = def.size * sprite.box * ps;
        const lod = lodFor(def.size * sprite.box * this.realPs);  // on-screen size drives the fade
        sheet = BANK.sheet(def, lod.mip);
        far = lod.fade < 1 ? BANK.sheet(def, FAR_MIP) : null;
        k = lod.fade;
      }
      const h = hash01(i);
      const size = box * plantLook(s, i, def, sprite, h);
      const dx = s.x[i] * ps - size * ANCHOR[0], dy = s.y[i] * ps - size * ANCHOR[1];
      if (far) {
        const ff = far.frame(PLANT_POSE_OUT, h);
        ctx.globalAlpha = 1;
        ctx.drawImage(far.canvas, far.sx[ff], far.sy[ff], far.cell, far.cell, dx, dy, size, size);
        ctx.globalAlpha = k;
      }
      const fi = sheet.frame(PLANT_POSE_OUT, h);
      ctx.drawImage(sheet.canvas, sheet.sx[fi], sheet.sy[fi], sheet.cell, sheet.cell, dx, dy, size, size);
    }
    ctx.globalAlpha = 1;
    b.cursor = end;
    return end >= n;
  }
}

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
    this.plantCache = new PlantCache(world);
  }

  setView(mode) { if (mode) this.viewMode = mode; }
  setShow(plants, animals) { this.showPlants = plants; this.showAnimals = animals; }

  buildLayers() {
    this.fieldLayers = [0, 1, 2].map(f => this.bakeField(f));
    this.minimapLayer = this.bakeMinimap();
    // The painted terrain: a progressively-sharpening tile pyramid baked in
    // workers; the flat type map stands in until the first tiles land.
    this.terrain = new TerrainTiles(this.world, this.minimapLayer);
  }

  // Stop terrain workers and free tiles (the renderer is rebuilt on reset).
  dispose() { this.terrain.dispose(); }

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

    const z = camera.zoom;
    const rot = camera.rot || 0;
    const ox = camera.worldToScreenX(0);
    const oy = camera.worldToScreenY(0);
    const dpr = this.dpr || 1;
    const ww = this.world.width * z, wh = this.world.height * z;

    // Does the world card cover the whole screen? Then the backdrop, card
    // shadow and frame are all hidden: skip those full-screen passes.
    const vb = camera.visibleBounds();
    const edgeVisible = vb.x0 < 0 || vb.y0 < 0 || vb.x1 > this.world.width || vb.y1 > this.world.height;
    // Space beyond the world's edge (upright, screen space).
    if (edgeVisible) this.drawBackdrop(ctx, W, H, dpr);

    // Everything in the world (terrain + entities) is drawn under the view
    // rotation, pivoting about the screen centre (== the camera focus). The
    // minimap stays upright, outside this transform.
    ctx.save();
    if (rot) { ctx.translate(W / 2, H / 2); ctx.rotate(rot); ctx.translate(-W / 2, -H / 2); }

    // The world floats like a sticker card: soft stacked shadow, then the map.
    if (edgeVisible) {
      // Shadow as three thin bands around the card (not full-card fills).
      ctx.fillStyle = 'rgba(4,2,12,0.22)';
      for (const g of [14, 9, 5]) {
        ctx.fillRect(ox - g * 0.6, oy + wh, ww + g * 1.2, g * 1.1);        // below
        ctx.fillRect(ox - g * 0.6, oy - g * 0.2, g * 0.6, wh + g * 0.2);   // left
        ctx.fillRect(ox + ww, oy - g * 0.2, g * 0.6, wh + g * 0.2);        // right
      }
    }
    if (this.viewMode === 'terrain') {
      this.terrain.draw(ctx, camera, ox, oy, z, dpr);
    } else {
      const layer = this.fieldLayers[VIEW_FIELD[this.viewMode]];
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(layer, 0, 0, layer.width, layer.height, ox, oy, ww, wh);
    }
    if (edgeVisible) {
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#2a1d3d';
      ctx.strokeRect(ox - 1.5, oy - 1.5, ww + 3, wh + 3);
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(190,170,255,0.35)';
      ctx.strokeRect(ox - 3.5, oy - 3.5, ww + 7, wh + 7);
    }

    // --- Entities: y-sorted sprite billboards, clipped to the map rectangle
    //     so nothing (including reef coral) spills past the world edge. ---
    ctx.save();
    ctx.beginPath();
    ctx.rect(ox, oy, this.world.width * z, this.world.height * z);
    ctx.clip();
    // Far-zoom plants come pre-baked in a world-space layer (see PlantCache):
    // one blit, under the map rotation like the terrain.
    const cacheMask = this.plantCache.update(sim, this, z * (this.dpr || 1));
    if (cacheMask) {
      const pc = this.plantCache.front;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(pc.canvas, 0, 0, pc.canvas.width, pc.canvas.height,
        ox, oy, pc.canvas.width / pc.ps * z, pc.canvas.height / pc.ps * z);
    }
    if (this.viewMode === 'terrain') this.drawSparkles(ctx, camera, ox, oy, z, dpr);
    // Sprites stay upright on screen while the map rotates under them, so
    // they're placed at rotated positions but drawn without the rotation.
    // (The clip above survives the transform reset.)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawEntities(sim, camera, cacheMask);
    ctx.restore();               // end world-rect clip

    ctx.restore();               // end view rotation
    this.drawMinimap(camera);
  }

  // Per-species draw parameters for this frame: on-screen size, LOD tier,
  // which baked sheets to sample, and the crossfade between them.
  speciesInfo(z, dpr) {
    const info = this._info || (this._info = []);
    info.length = SPECIES.length;
    for (let sp = 0; sp < SPECIES.length; sp++) {
      const def = SPECIES[sp];
      const sprite = spriteFor(def);
      const boxPx = def.size * sprite.box * z;
      const dev = boxPx * dpr;
      const it = info[sp] || (info[sp] = {});
      it.def = def; it.sprite = sprite; it.boxPx = boxPx;
      it.layer = layerOf(def, sprite);
      it.dots = dev < DOT_PX;
      it.far = null; it.nearAlpha = 1;
      if (!it.dots) {
        const lod = lodFor(dev);
        it.near = BANK.sheet(def, lod.mip);
        if (lod.fade < 1) { it.far = BANK.sheet(def, FAR_MIP); it.nearAlpha = lod.fade; }
      }
    }
    return info;
  }

  // Motion memory per entity slot: last position → walk phase, smoothed
  // speed (move vs idle frames) and a sticky facing, so animation is driven
  // by how far a critter actually travelled (faster run → faster steps).
  ensureMotion(cap) {
    if (this._mCap === cap) return;
    this._mCap = cap;
    this.mX = new Float32Array(cap); this.mY = new Float32Array(cap);
    this.mAge = new Float32Array(cap); this.mPh = new Float32Array(cap);
    this.mSpd = new Float32Array(cap); this.mFace = new Uint8Array(cap);
    this.sX = new Float32Array(cap); this.sY = new Float32Array(cap);
    this.keys = [0, 1, 2, 3].map(() => new Float64Array(cap));
    this.nKeys = new Int32Array(4);
  }

  drawEntities(sim, camera, cacheMask) {
    const ctx = this.ctx;
    const s = sim.store;
    const z = camera.zoom, rot = camera.rot || 0;
    const W = camera.viewW, H = camera.viewH;
    const dpr = this.dpr || 1;
    const now = performance.now();
    const dt = Math.min(0.1, Math.max(0.001, (now - (this._last || now - 16)) / 1000));
    this._last = now;
    const secs = now / 1000;
    this.ensureMotion(s.capacity);
    const info = this.speciesInfo(z, dpr);

    const b = camera.visibleBounds();
    const x0 = b.x0 - WORLD_PAD, x1 = b.x1 + WORLD_PAD, y0 = b.y0 - WORLD_PAD, y1 = b.y1 + WORLD_PAD;
    const cr = Math.cos(rot), sr = Math.sin(rot);
    const cx = camera.x, cy = camera.y, hw = W / 2, hh = H / 2;
    const n = s.highWater;
    const keys = this.keys, nk = this.nKeys;
    nk.fill(0);

    // Far-zoom tier: species too small for a sprite collect into one dot path each.
    const dotPaths = this._dots || (this._dots = []);
    dotPaths.length = SPECIES.length + 1;
    dotPaths.fill(null);
    const CORPSE_DOTS = SPECIES.length;

    // ---- 1. Cull, project, bucket by layer ----
    for (let i = 0; i < n; i++) {
      if (!s.alive[i]) continue;
      const sp = s.species[i];
      const it = info[sp];
      const plant = it.def.kind === 'plant';
      if (plant ? !this.showPlants : !this.showAnimals) continue;
      if (plant && (cacheMask & (1 << sp))) continue;        // already in the cache layer
      const wx = s.x[i], wy = s.y[i];
      if (wx < x0 || wx > x1 || wy < y0 || wy > y1) continue;
      const px = (wx - cx) * z, py = (wy - cy) * z;
      const X = hw + px * cr - py * sr, Y = hh + px * sr + py * cr;
      const corpse = s.state[i] === ENTITY_STATE.DECAYING;
      if (it.dots) {
        const k = corpse ? CORPSE_DOTS : sp;
        const r = Math.max(0.7, it.boxPx * (plant ? 0.3 : 0.24));
        (dotPaths[k] || (dotPaths[k] = new Path2D())).rect(X - r, Y - r * 1.4, r * 2, r * 2);
        continue;
      }
      this.sX[i] = X; this.sY[i] = Y;
      const L = corpse ? LAYER.GROUND : it.layer;
      keys[L][nk[L]++] = Math.floor((Y + 8192) * 4) * KEY_SPAN + i;
    }

    // ---- 2. Draw layers back-to-front ----
    const fillDots = (L) => {
      for (let sp = 0; sp < SPECIES.length; sp++) {
        if (!dotPaths[sp] || info[sp].layer !== L) continue;
        ctx.fillStyle = info[sp].def.color;
        ctx.fill(dotPaths[sp]);
      }
      if (L === LAYER.GROUND && dotPaths[CORPSE_DOTS]) {
        ctx.globalAlpha = 0.6; ctx.fillStyle = CORPSE_COLOR;
        ctx.fill(dotPaths[CORPSE_DOTS]); ctx.globalAlpha = 1;
      }
    };
    const fade = CONFIG.sim.decayTicks || 1;
    ctx.imageSmoothingEnabled = true;

    const drawLayer = (L) => {
      fillDots(L);
      const cnt = nk[L];
      if (!cnt) return;
      const list = keys[L].subarray(0, cnt);
      list.sort();
      // Fliers: all shadows first so no bird's shadow lands on another bird.
      const shadowPass = L === LAYER.AERIAL;
      for (let pass = shadowPass ? 0 : 1; pass < 2; pass++) {
        for (let q = 0; q < cnt; q++) {
          const i = list[q] % KEY_SPAN;
          this.drawOne(s, i, info[s.species[i]], pass === 0, secs, dt, cr, sr, fade);
        }
      }
    };

    drawLayer(LAYER.DECAL);
    drawLayer(LAYER.GROUND);
    drawLayer(LAYER.CANOPY);
    drawLayer(LAYER.AERIAL);
    ctx.globalAlpha = 1;
  }

  // Draw entity `i` (or only its flier shadow when `shadowOnly`).
  drawOne(s, i, it, shadowOnly, secs, dt, cr, sr, fade) {
    const ctx = this.ctx;
    const sprite = it.sprite, def = it.def;
    const X = this.sX[i], Y = this.sY[i];
    const h = hash01(i);
    let pose, t = 0, scale = 1, alpha = 1, lift = 0;

    if (s.state[i] === ENTITY_STATE.DECAYING) {
      if (shadowOnly) return;
      pose = animalPose(false, ANIM.DEAD, this.mFace[i] === 1);
      alpha = Math.max(0.15, s.decay[i] / fade);
    } else if (def.kind === 'plant') {
      scale = plantLook(s, i, def, sprite, h);
      pose = PLANT_POSE_OUT;
      t = (secs * PLANT_SWAY_HZ + h) % 1;
    } else {
      // ---- motion → animation state ----
      const x = s.x[i], y = s.y[i], age = s.age[i];
      let d = Math.hypot(x - this.mX[i], y - this.mY[i]);
      if (!shadowOnly) {
        if (d > 4 || age < this.mAge[i]) { d = 0; this.mSpd[i] = 0; this.mPh[i] = h; }  // new occupant
        this.mX[i] = x; this.mY[i] = y; this.mAge[i] = age;
        this.mPh[i] = (this.mPh[i] + Math.min(d / (sprite.stride || 2), MAX_PHASE_STEP)) % 1;
        this.mSpd[i] = this.mSpd[i] * 0.85 + (d / dt) * 0.15;
        const hxs = s.hx[i] * cr - s.hy[i] * sr;
        if (hxs > 0.2) this.mFace[i] = 0; else if (hxs < -0.2) this.mFace[i] = 1;
      }
      const moving = this.mSpd[i] > 0.35;
      const baby = age < (def.matureAge || 1);
      if (baby) scale = JUVENILE_MIN + (1 - JUVENILE_MIN) * (age / def.matureAge);
      const grounded = sprite.aerial && sprite.idleGrounded && s.feeding[i];
      let anim = moving ? ANIM.MOVE : ANIM.IDLE;
      if (sprite.aerial && sprite.idleGrounded) anim = grounded ? ANIM.IDLE : ANIM.MOVE;
      t = anim === ANIM.MOVE && moving ? this.mPh[i] : (secs * IDLE_HZ + h) % 1;
      pose = animalPose(baby, anim, this.mFace[i] === 1);
      // Swimmers sheltering on a reef read as tucked in among the coral.
      if (!sprite.aerial && this.world.terrainAt(x, y) === TERRAIN.CORAL) alpha = REEF_ALPHA;
      if (sprite.aerial && !grounded) {
        lift = it.boxPx * scale * (sprite.altitude + 0.04 * Math.sin((secs * 0.9 + h) * Math.PI * 2));
      }
    }

    const size = it.boxPx * scale;
    if (shadowOnly) {
      if (lift > 0) {
        const r = size * 0.3;
        ctx.globalAlpha = 1;
        ctx.drawImage(BANK.shadowSprite(), X - r, Y - r * 0.35, r * 2, r * 0.7);
      }
      return;
    }
    const dx = X - size * ANCHOR[0], dy = Y - size * ANCHOR[1] - lift;
    const near = it.near;
    if (it.far) {
      const far = it.far, ff = far.frame(pose, t);
      ctx.globalAlpha = alpha;
      ctx.drawImage(far.canvas, far.sx[ff], far.sy[ff], far.cell, far.cell, dx, dy, size, size);
      ctx.globalAlpha = alpha * it.nearAlpha;
    } else {
      ctx.globalAlpha = alpha;
    }
    const f = near.frame(pose, t);
    ctx.drawImage(near.canvas, near.sx[f], near.sy[f], near.cell, near.cell, dx, dy, size, size);
  }

  // Deep-space backdrop beyond the world's edge, baked per viewport size.
  drawBackdrop(ctx, W, H, dpr) {
    const k = W + 'x' + H + '@' + dpr;
    if (this._bgKey !== k) {
      this._bgKey = k;
      const c = document.createElement('canvas');
      c.width = Math.round(W * dpr); c.height = Math.round(H * dpr);
      const g = c.getContext('2d');
      g.scale(dpr, dpr);
      const grad = g.createRadialGradient(W * 0.5, H * 0.4, 0, W * 0.5, H * 0.4, Math.hypot(W, H) * 0.7);
      grad.addColorStop(0, '#1c1640'); grad.addColorStop(1, '#07060f');
      g.fillStyle = grad; g.fillRect(0, 0, W, H);
      const neb = [[0.2, 0.25, '#5a2f7a'], [0.8, 0.7, '#1f4f7a'], [0.6, 0.15, '#6b2f5a']];
      for (const [x, y, col] of neb) {
        const r = Math.max(W, H) * 0.35;
        const ng = g.createRadialGradient(W * x, H * y, 0, W * x, H * y, r);
        ng.addColorStop(0, col + '55'); ng.addColorStop(1, col + '00');
        g.fillStyle = ng; g.fillRect(0, 0, W, H);
      }
      for (let i = 0; i < (W * H) / 900; i++) {
        const h = hash01(i * 7 + 3), h2 = hash01(i * 13 + 1), h3 = hash01(i * 5 + 11);
        g.fillStyle = `rgba(255,250,235,${0.25 + h3 * 0.7})`;
        const r = h3 > 0.93 ? 1.4 : 0.7;
        g.beginPath(); g.arc(h * W, h2 * H, r, 0, Math.PI * 2); g.fill();
      }
      this._bg = c;
    }
    ctx.drawImage(this._bg, 0, 0, W, H);
  }

  // Sun glints twinkling on open water (zoomed in only). Sparse, hash-placed
  // per cell, each blinking on its own slow cycle; drawn in world space.
  drawSparkles(ctx, camera, ox, oy, z, dpr) {
    if (z * dpr < 14) return;
    if (!this._spark) {
      const c = document.createElement('canvas');
      c.width = c.height = 32;
      const g = c.getContext('2d');
      const rg = g.createRadialGradient(16, 16, 0, 16, 16, 16);
      rg.addColorStop(0, 'rgba(255,255,255,0.9)'); rg.addColorStop(0.25, 'rgba(220,245,255,0.35)'); rg.addColorStop(1, 'rgba(220,245,255,0)');
      g.fillStyle = rg; g.fillRect(0, 0, 32, 32);
      g.fillStyle = '#fff';
      g.beginPath();
      g.moveTo(16, 1); g.quadraticCurveTo(17.2, 14.8, 31, 16); g.quadraticCurveTo(17.2, 17.2, 16, 31);
      g.quadraticCurveTo(14.8, 17.2, 1, 16); g.quadraticCurveTo(14.8, 14.8, 16, 1); g.fill();
      this._spark = c;
    }
    const w = this.world, b = camera.visibleBounds();
    const x0 = Math.max(0, Math.floor(b.x0)), x1 = Math.min(w.width - 1, Math.ceil(b.x1));
    const y0 = Math.max(0, Math.floor(b.y0)), y1 = Math.min(w.height - 1, Math.ceil(b.y1));
    const secs = performance.now() / 1000;
    const r = Math.min(12, Math.max(3, z * 0.3));
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const h = hash01(cy * 4096 + cx);
        if (h > 0.06) continue;
        const t = w.terrain[cy * w.width + cx];
        if (t !== TERRAIN.SHALLOW_WATER && t !== TERRAIN.DEEP_WATER) continue;
        const ph = Math.sin((secs * 0.45 + h * 97) * Math.PI * 2);
        if (ph < 0.75) continue;
        const a = Math.pow((ph - 0.75) / 0.25, 2);
        ctx.globalAlpha = a;
        const k = 0.6 + a * 0.4;
        ctx.drawImage(this._spark, ox + (cx + 0.2 + h * 10 % 0.6) * z - r * k, oy + (cy + 0.3 + (h * 37) % 0.4) * z - r * k, 2 * r * k, 2 * r * k);
      }
    }
    ctx.globalAlpha = 1;
  }

  drawMinimap(camera) {
    const mm = this.minimap, ctx = this.mmCtx;
    const art = this.viewMode === 'terrain' && this.terrain.base(mm.width, mm.height);
    ctx.imageSmoothingEnabled = !!art;
    ctx.drawImage(art || this.minimapLayer, 0, 0, mm.width, mm.height);
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
