// ===========================================================================
//  World — continuous terrain fields (elevation, moisture, rockiness), the
//  discrete terrain type derived from them, and habitat suitability used by
//  the simulation. Fields are generated once and never recomputed.
// ===========================================================================
import {
  CONFIG, TERRAIN_INFO, classifyTerrain, HABITAT_SOFTNESS, MIN_HABITABLE,
} from './config.js';

// Deterministic PRNG (mulberry32) so a seed reproduces a map.
export function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Cheap value-noise: random lattice + smooth interpolation, tileable.
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

// Two-octave fractal sample in [0,1].
function fbm(noise, x, y, s) {
  return noise(x * s, y * s) * 0.65 + noise(x * s * 2.3, y * s * 2.3) * 0.35;
}

export class World {
  constructor(cfg = CONFIG.world) {
    this.width = cfg.width;
    this.height = cfg.height;
    const n = this.width * this.height;
    // Interleaved fields would hurt cache for per-field passes; keep separate.
    this.fields = [
      new Float32Array(n), // elevation
      new Float32Array(n), // moisture
      new Float32Array(n), // rockiness
    ];
    this.terrain = new Uint8Array(n); // derived discrete type
    this.generate(cfg);
  }

  idx(x, y) { return y * this.width + x; }
  inBounds(x, y) {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  generate(cfg) {
    const rng = makeRng(cfg.seed);
    const lattice = 64;
    const nElev = makeValueNoise(rng, lattice, lattice);
    const nMoist = makeValueNoise(rng, lattice, lattice);
    const nRock = makeValueNoise(rng, lattice, lattice);
    const s = cfg.noiseScale;
    const [elev, moist, rock] = this.fields;

    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const i = this.idx(x, y);
        const e = fbm(nElev, x, y, s);
        // Moisture: its own field, but wetter in the lowlands (near water).
        let m = fbm(nMoist, x + 500, y, s * 1.4);
        m = m * 0.7 + (1 - e) * 0.3;
        // Rockiness: its own field, but rockier on the heights.
        let r = fbm(nRock, x, y + 500, s * 1.7);
        r = r * 0.6 + Math.max(0, e - 0.5) * 0.8;

        elev[i] = e;
        moist[i] = clamp01(m);
        rock[i] = clamp01(r);
        this.terrain[i] = classifyTerrain(elev[i], moist[i], rock[i]);
      }
    }
  }

  fieldAt(field, wx, wy) {
    const x = wx | 0, y = wy | 0;
    if (!this.inBounds(x, y)) return -1;
    return this.fields[field][this.idx(x, y)];
  }

  // Discrete terrain type at a world position (floored). -1 if out of bounds.
  terrainAt(wx, wy) {
    const x = wx | 0, y = wy | 0;
    if (!this.inBounds(x, y)) return -1;
    return this.terrain[this.idx(x, y)];
  }

  // Habitat suitability in [0,1] for a species at a world position: the
  // product of per-band membership (1 inside the band, ramping to 0 over
  // HABITAT_SOFTNESS outside). 0 outside the world.
  suitability(wx, wy, sp) {
    const x = wx | 0, y = wy | 0;
    if (!this.inBounds(x, y)) return 0;
    const i = this.idx(x, y);
    let s = 1;
    const bands = sp.bands;
    for (let b = 0; b < bands.length; b++) {
      const band = bands[b];
      s *= bandMembership(this.fields[band.field][i], band.lo, band.hi);
      if (s <= 0) return 0;
    }
    return s;
  }

  // Count of cells of each terrain type — used to spread initial spawns.
  terrainCounts() {
    const counts = new Array(TERRAIN_INFO.length).fill(0);
    for (let i = 0; i < this.terrain.length; i++) counts[this.terrain[i]]++;
    return counts;
  }
}

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

// 1 inside [lo,hi]; linear ramp to 0 over HABITAT_SOFTNESS beyond each edge.
function bandMembership(v, lo, hi) {
  if (v >= lo && v <= hi) return 1;
  const d = v < lo ? lo - v : v - hi;
  const m = 1 - d / HABITAT_SOFTNESS;
  return m > 0 ? m : 0;
}

export { MIN_HABITABLE };
