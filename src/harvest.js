// ===========================================================================
//  Harvesting — the Wexles pull organisms out of the ecosystem at a per-species
//  rate the player chooses, and the organisms' `wexle` values accumulate into a
//  resource tally for the (future) colony.
//
//  Levels: none / some / a lot / as needed. "As needed" scales with colony
//  size, so it ramps up as the colony grows (the fastest setting late-game).
//  Until the colony (#10) exists, `colonySize` is a stub that grows from the
//  value harvested, which keeps the "as needed" feedback loop self-consistent.
// ===========================================================================
import { SPECIES, SPECIES_INDEX, NUM_SPECIES } from './config.js';

export const HARVEST_LEVELS = ['none', 'some', 'alot', 'asneeded'];
export const HARVEST_LABELS = {
  none: 'None', some: 'Some', alot: 'A Lot', asneeded: 'As Needed',
};

// Tunables (individuals per second).
const SOME_RATE = 0.5;        // a slow trickle (< 1/s by design)
const ALOT_RATE = 4;          // heavy fixed draw
const AS_NEEDED_BASE = 4;     // matches "a lot" at colony size 0...
const AS_NEEDED_SCALE = 0.02; // ...and grows with the colony from there
const COLONY_GAIN = 0.01;     // colonySize gained per unit of harvested value

export class HarvestController {
  constructor() {
    this.levels = {};
    for (const sp of SPECIES) this.levels[sp.id] = 'none';
    this.resources = { food: 0, material: 0, value: 0 };
    this.harvestedTotal = new Int32Array(NUM_SPECIES);
    this._accum = new Float32Array(NUM_SPECIES); // fractional quota carryover
    this.colonySize = 0;                         // stub until #10
    this._scratch = [];                          // reused index buffer
  }

  setLevel(speciesId, level) {
    if (!HARVEST_LEVELS.includes(level)) {
      throw new Error(`invalid harvest level: ${level}`);
    }
    if (!(speciesId in this.levels)) {
      throw new Error(`unknown species: ${speciesId}`);
    }
    this.levels[speciesId] = level;
  }

  getLevel(speciesId) { return this.levels[speciesId]; }

  ratePerSecond(speciesIdx) {
    switch (this.levels[SPECIES[speciesIdx].id]) {
      case 'some': return SOME_RATE;
      case 'alot': return ALOT_RATE;
      case 'asneeded': return AS_NEEDED_BASE + this.colonySize * AS_NEEDED_SCALE;
      default: return 0;
    }
  }

  // Advance harvesting by `dtSeconds`. `ctx` provides `store` and `rand()`.
  step(ctx, dtSeconds) {
    const store = ctx.store;
    for (const sp of SPECIES) {
      if (this.levels[sp.id] === 'none') continue;
      const idx = sp.index;
      const rate = this.ratePerSecond(idx);
      if (rate <= 0) continue;
      this._accum[idx] += rate * dtSeconds;
      const take = Math.floor(this._accum[idx]);
      if (take <= 0) continue;
      this._accum[idx] -= take;
      const removed = this._removeN(store, idx, take, ctx.rand);
      if (removed > 0) {
        const w = sp.wexle;
        this.resources.food += removed * w.food;
        this.resources.material += removed * w.material;
        this.resources.value += removed * w.value;
        this.harvestedTotal[idx] += removed;
        this.colonySize += removed * w.value * COLONY_GAIN;
      }
    }
  }

  // Remove up to `want` random live individuals of a species. Returns how many
  // were actually removed (capped at the live population).
  _removeN(store, speciesIdx, want, rand) {
    if (want <= 0) return 0;
    const arr = this._scratch;
    arr.length = 0;
    const n = store.highWater;
    for (let i = 0; i < n; i++) {
      if (store.alive[i] && store.species[i] === speciesIdx) arr.push(i);
    }
    const len = arr.length;
    const take = Math.min(want, len);
    if (take === len) {
      for (let i = 0; i < len; i++) store.kill(arr[i]);
      return len;
    }
    // Partial Fisher–Yates: pick `take` distinct individuals uniformly.
    for (let k = 0; k < take; k++) {
      let j = k + Math.floor(rand() * (len - k));
      if (j >= len) j = len - 1;
      const tmp = arr[k]; arr[k] = arr[j]; arr[j] = tmp;
      store.kill(arr[k]);
    }
    return take;
  }
}

// Re-exported for the UI layer's convenience.
export { SPECIES_INDEX };
