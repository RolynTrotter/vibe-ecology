// ===========================================================================
//  terrain/tiles — a zoomable, map-app style tile pyramid for the painted
//  terrain (terrain/art.js).
//
//  Levels are px-per-world-unit (4 … 64, ~√2 apart). Each frame uses the
//  finest level that only needs upscaling (a software canvas shrinks images
//  far more slowly than it grows them). When some of that level's tiles are
//  still baking, the whole-map base level (and whatever of the next-coarser
//  level is cached) is drawn underneath first, and before even the base
//  exists, the flat 1px/cell type map — so the view sharpens progressively
//  and never shows holes. Baking happens in Web Workers (OffscreenCanvas) — or, where
//  those aren't supported, on the main thread one tile per frame.
// ===========================================================================
import { TILE, GUTTER, bakeTile } from './art.js';

export const LEVELS = [4, 6, 8, 11, 16, 23, 32, 45, 64];
const MAX_TILES = 90;          // LRU budget (~24 MB) beyond the always-kept base level
const WORKERS = 2;

export function levelFor(pxPerUnit) {
  let l = 0;
  while (l + 1 < LEVELS.length && LEVELS[l + 1] <= pxPerUnit * 1.02) l++;
  return l;
}

const key = (l, tx, ty) => (l << 24) | (ty << 12) | tx;

export class TerrainTiles {
  constructor(world, fallbackLayer) {
    this.world = world;
    this.fallback = fallbackLayer;      // 1px-per-cell canvas, drawn smoothed
    this.tiles = new Map();             // key -> ImageBitmap | canvas (Map order = LRU)
    this.pending = new Set();
    this.queue = [];                    // keys wanted this frame, best first
    this.workers = [];
    this.idle = [];
    this.mainThread = false;
    this.baseKeys = [];
    this.baseDone = null;               // composited base level (for the minimap)
    this.startWorkers();
    // Request the whole map at the coarsest level up front: it's the fallback.
    const P = LEVELS[0];
    for (let ty = 0; ty < Math.ceil(world.height * P / TILE); ty++) {
      for (let tx = 0; tx < Math.ceil(world.width * P / TILE); tx++) this.baseKeys.push(key(0, tx, ty));
    }
  }

  startWorkers() {
    if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') { this.mainThread = true; return; }
    let failed = 0;
    for (let i = 0; i < WORKERS; i++) {
      let w;
      try { w = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' }); }
      catch (_) { this.mainThread = true; return; }
      w.onmessage = (e) => {
        const m = e.data;
        if (m.type === 'ready') {
          if (m.ok) this.idle.push(w);
          else if (++failed === WORKERS) { this.mainThread = true; this.dispose(true); }
        } else if (m.type === 'tile') {
          this.pending.delete(m.key);
          this.store(m.key, m.bmp);
          this.idle.push(w);
          this.pump();
        }
      };
      w.onerror = () => { if (++failed === WORKERS) { this.mainThread = true; this.pending.clear(); } };
      w.postMessage({ type: 'init', cfg: this.world.cfg });
      this.workers.push(w);
    }
  }

  store(k, img) {
    if (this.disposed) { img.close?.(); return; }
    this.tiles.set(k, img);
    // Evict least-recently-used tiles beyond the budget (never the base level).
    if (this.tiles.size > MAX_TILES + this.baseKeys.length) {
      for (const [ek, ev] of this.tiles) {
        if ((ek >>> 24) === 0) continue;
        this.tiles.delete(ek);
        ev.close?.();
        if (this.tiles.size <= MAX_TILES + this.baseKeys.length) break;
      }
    }
  }

  get(k) {
    const t = this.tiles.get(k);
    if (t) { this.tiles.delete(k); this.tiles.set(k, t); }   // bump LRU
    return t;
  }

  want(k) {
    if (this.tiles.has(k) || this.pending.has(k)) return;
    this.queue.push(k);
  }

  // Hand queued tiles to idle workers (or bake one here on the main thread).
  pump() {
    while (this.idle.length && this.queue.length) {
      const k = this.queue.shift();
      if (this.tiles.has(k) || this.pending.has(k)) continue;
      const w = this.idle.pop();
      this.pending.add(k);
      w.postMessage({ type: 'tile', key: k, P: LEVELS[k >>> 24], tx: k & 4095, ty: (k >>> 12) & 4095 });
    }
    if (this.mainThread && this.queue.length) {
      const k = this.queue.shift();
      const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
      this.store(k, bakeTile(this.world, LEVELS[k >>> 24], k & 4095, (k >>> 12) & 4095, mk));
    }
  }

  // Draw the terrain for the current camera. Called under the view rotation,
  // with (ox,oy) the screen position of world (0,0) and z px per world unit.
  draw(ctx, camera, ox, oy, z, dpr) {
    const W = this.world.width, H = this.world.height;
    const b = camera.visibleBounds();
    const L = levelFor(z * dpr);
    const P = LEVELS[L];
    const span = TILE / P;                                 // world units per tile
    const tx0 = Math.max(0, Math.floor(b.x0 / span)), ty0 = Math.max(0, Math.floor(b.y0 / span));
    const tx1 = Math.min(Math.ceil(W / span) - 1, Math.floor(b.x1 / span));
    const ty1 = Math.min(Math.ceil(H / span) - 1, Math.floor(b.y1 / span));

    // Queue: base level first (the fallback), then this level nearest-centre first.
    this.queue.length = 0;
    for (const k of this.baseKeys) this.want(k);
    const cx = camera.x / span - 0.5, cy = camera.y / span - 0.5;
    const need = [];
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) need.push([tx, ty]);
    need.sort((a, c) => Math.hypot(a[0] - cx, a[1] - cy) - Math.hypot(c[0] - cx, c[1] - cy));
    for (const [tx, ty] of need) this.want(key(L, tx, ty));
    this.pump();

    ctx.imageSmoothingEnabled = true;
    let complete = true;
    for (const [tx, ty] of need) if (!this.tiles.has(key(L, tx, ty))) { complete = false; break; }
    if (!complete) {
      // Underlay: the flat map (until the base exists), then the base level,
      // then any cached tiles of the next-coarser level.
      if (!this.baseKeys.every(k => this.tiles.has(k))) {
        ctx.drawImage(this.fallback, 0, 0, W, H, ox, oy, W * z, H * z);
      }
      if (L > 0) this.drawLevel(ctx, 0, b, ox, oy, z, dpr, false);
      if (L > 1) this.drawLevel(ctx, L - 1, b, ox, oy, z, dpr, false);
    }
    this.drawLevel(ctx, L, b, ox, oy, z, dpr, true);
  }

  // Draw the cached tiles of level `l` intersecting bounds `b`.
  drawLevel(ctx, l, b, ox, oy, z, dpr, bump) {
    const P = LEVELS[l], span = TILE / P;
    const W = this.world.width, H = this.world.height;
    const tx0 = Math.max(0, Math.floor(b.x0 / span)), ty0 = Math.max(0, Math.floor(b.y0 / span));
    const tx1 = Math.min(Math.ceil(W / span) - 1, Math.floor(b.x1 / span));
    const ty1 = Math.min(Math.ceil(H / span) - 1, Math.floor(b.y1 / span));
    const seam = 0.6 / dpr;                                // overlap so AA edges don't gap
    const ds = span * z, g = seam / ds * TILE;
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const k = key(l, tx, ty);
        const t = bump ? this.get(k) : this.tiles.get(k);
        if (!t) continue;
        ctx.drawImage(t, GUTTER - g, GUTTER - g, TILE + 2 * g, TILE + 2 * g,
          ox + tx * ds - seam, oy + ty * ds - seam, ds + 2 * seam, ds + 2 * seam);
      }
    }
  }

  // The base level composited into one w×h canvas once it's all baked (the
  // painted minimap); null until then.
  base(w, h) {
    if (this.baseDone) return this.baseDone;
    if (!this.baseKeys.every(k => this.tiles.has(k))) return null;
    const P = LEVELS[0];
    // Composite at the requested size once, so per-frame use is a 1:1 blit.
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    const sx = w / (this.world.width * P), sy = h / (this.world.height * P);
    for (const k of this.baseKeys) {
      ctx.drawImage(this.tiles.get(k), GUTTER, GUTTER, TILE, TILE,
        (k & 4095) * TILE * sx, ((k >>> 12) & 4095) * TILE * sy, TILE * sx, TILE * sy);
    }
    this.baseDone = c;
    return c;
  }

  dispose(keepTiles = false) {
    for (const w of this.workers) w.terminate();
    this.workers = []; this.idle = [];
    if (keepTiles) return;
    this.disposed = true;
    for (const t of this.tiles.values()) t.close?.();
    this.tiles.clear();
  }
}
