// ===========================================================================
//  EntityStore — Structure-of-Arrays storage for every living organism.
//  Plants and animals share the same arrays; `species` distinguishes them.
//  A free list recycles dead slots so spawning/dying stays O(1) and we never
//  reallocate during the sim.
// ===========================================================================
import { SPECIES } from './config.js';

// An occupied slot (alive[i] === 1) is in one of these states. A DECAYING slot
// is a corpse: it no longer lives, moves, or counts toward its species, but it
// lingers in the world (and the spatial grid) as carrion for scavengers and
// fades visually before its slot is recycled.
export const ENTITY_STATE = { ALIVE: 0, DECAYING: 1 };

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
    this.state = new Uint8Array(capacity);    // ENTITY_STATE; only valid when alive
    this.decay = new Float32Array(capacity);  // remaining decay ticks (corpses)
    this.feeding = new Uint8Array(capacity);  // 1 while a scavenger is on a carcass

    this.highWater = 0;        // one past the highest slot ever used
    this.living = 0;           // current live count (excludes corpses)
    this.freeList = [];        // recycled dead slot indices
    this.counts = new Int32Array(SPECIES.length); // live count per species
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
    this.state[i] = ENTITY_STATE.ALIVE;
    this.decay[i] = 0;
    this.feeding[i] = 0;
    this.living++;
    this.counts[speciesIdx]++;
    return i;
  }

  // Turn a living animal into a corpse (death of old age). It stops counting as
  // alive immediately but keeps its slot as decaying carrion for `decayTicks`.
  die(i, decayTicks) {
    if (!this.alive[i] || this.state[i] !== ENTITY_STATE.ALIVE) return;
    this.living--;
    this.counts[this.species[i]]--;
    this.state[i] = ENTITY_STATE.DECAYING;
    this.decay[i] = decayTicks;
    this.feeding[i] = 0;
  }

  kill(i) {
    if (!this.alive[i]) return;
    this.alive[i] = 0;
    // A corpse already left the living tallies in die(); don't double-count.
    if (this.state[i] === ENTITY_STATE.ALIVE) {
      this.living--;
      this.counts[this.species[i]]--;
    }
    this.state[i] = ENTITY_STATE.ALIVE;
    this.decay[i] = 0;
    this.feeding[i] = 0;
    this.freeList.push(i);
  }
}
