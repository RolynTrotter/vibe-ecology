// ===========================================================================
//  EntityStore — Structure-of-Arrays storage for every living organism.
//  Plants and animals share the same arrays; `species` distinguishes them.
//  A free list recycles dead slots so spawning/dying stays O(1) and we never
//  reallocate during the sim.
// ===========================================================================
import { NUM_SPECIES } from './config.js';

export class EntityStore {
  constructor(capacity) {
    this.capacity = capacity;
    this.x = new Float32Array(capacity);
    this.y = new Float32Array(capacity);
    this.hx = new Float32Array(capacity);     // heading (unit vector)
    this.hy = new Float32Array(capacity);
    this.energy = new Float32Array(capacity);
    this.age = new Float32Array(capacity);
    this.reproTimer = new Float32Array(capacity);
    this.species = new Uint8Array(capacity);
    this.alive = new Uint8Array(capacity);

    this.highWater = 0;        // one past the highest slot ever used
    this.living = 0;           // current live count
    this.freeList = [];        // recycled dead slot indices
    this.counts = new Int32Array(NUM_SPECIES); // live count per species
  }

  spawn(speciesIdx, x, y, energy, hx = 0, hy = 0) {
    let i;
    if (this.freeList.length) {
      i = this.freeList.pop();
    } else if (this.highWater < this.capacity) {
      i = this.highWater++;
    } else {
      return -1; // at capacity — spawn refused
    }
    this.x[i] = x;
    this.y[i] = y;
    this.hx[i] = hx;
    this.hy[i] = hy;
    this.energy[i] = energy;
    this.age[i] = 0;
    this.reproTimer[i] = 0;
    this.species[i] = speciesIdx;
    this.alive[i] = 1;
    this.living++;
    this.counts[speciesIdx]++;
    return i;
  }

  kill(i) {
    if (!this.alive[i]) return;
    this.alive[i] = 0;
    this.living--;
    this.counts[this.species[i]]--;
    this.freeList.push(i);
  }
}
