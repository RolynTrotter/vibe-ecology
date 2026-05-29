// ===========================================================================
//  World — the terrain grid and its procedural generation.
// ===========================================================================
import { TERRAIN, CONFIG } from './config.js';

// Small deterministic PRNG (mulberry32) so a given seed reproduces a map.
export function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Cheap value-noise: random lattice + smooth interpolation. Good enough to
// carve plausible lakes and shorelines without a real Perlin implementation.
function makeValueNoise(rng, gw, gh) {
  const grid = new Float32Array(gw * gh);
  for (let i = 0; i < grid.length; i++) grid[i] = rng();
  const smooth = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const x1 = x0 + 1, y1 = y0 + 1;
    const sx = smooth(x - x0), sy = smooth(y - y0);
    const at = (gx, gy) =>
      grid[((gy % gh + gh) % gh) * gw + ((gx % gw + gw) % gw)];
    const top = at(x0, y0) * (1 - sx) + at(x1, y0) * sx;
    const bot = at(x0, y1) * (1 - sx) + at(x1, y1) * sx;
    return top * (1 - sy) + bot * sy;
  };
}

export class World {
  constructor(cfg = CONFIG.world) {
    this.width = cfg.width;
    this.height = cfg.height;
    this.terrain = new Uint8Array(this.width * this.height);
    this.generate(cfg);
  }

  idx(x, y) { return y * this.width + x; }

  inBounds(x, y) {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  // Terrain at world coordinates (floored to grid).
  terrainAt(wx, wy) {
    const x = wx | 0, y = wy | 0;
    if (!this.inBounds(x, y)) return -1;
    return this.terrain[this.idx(x, y)];
  }

  generate(cfg) {
    const rng = makeRng(cfg.seed);
    // A couple of octaves of value noise for more organic coastlines.
    const lattice = 64;
    const n1 = makeValueNoise(rng, lattice, lattice);
    const n2 = makeValueNoise(rng, lattice, lattice);
    const s = cfg.noiseScale;
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const e = n1(x * s, y * s) * 0.65 + n2(x * s * 2.3, y * s * 2.3) * 0.35;
        this.terrain[this.idx(x, y)] =
          e < cfg.waterLevel ? TERRAIN.SHALLOW_WATER : TERRAIN.DIRT;
      }
    }
  }

  // Count of cells of each terrain — handy for spreading initial populations.
  terrainCounts() {
    let water = 0, dirt = 0;
    for (let i = 0; i < this.terrain.length; i++) {
      if (this.terrain[i] === TERRAIN.SHALLOW_WATER) water++; else dirt++;
    }
    return { water, dirt };
  }
}
