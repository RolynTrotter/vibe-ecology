// ===========================================================================
//  Colony — the Wexle city. It consumes the food harvested from the ecosystem
//  to grow its population, and unlocks buildings as it grows. Its population is
//  the real `colonySize` that "As Needed" harvesting scales with (replacing the
//  earlier stub). See issue #10.
// ===========================================================================

// Buildings appear as the colony grows past a population threshold. (Material/
// value gating can layer on later.)
export const BUILDINGS = [
  { id: 'pod', name: 'Landing Pod', icon: '🛸', pop: 0 },
  { id: 'hatchery', name: 'Hatchery', icon: '🥚', pop: 5 },
  { id: 'granary', name: 'Granary', icon: '🌾', pop: 12 },
  { id: 'workshop', name: 'Workshop', icon: '⚒️', pop: 25 },
  { id: 'spire', name: 'Spire', icon: '🗼', pop: 55 },
  { id: 'dome', name: 'Grand Dome', icon: '🏛️', pop: 110 },
];

const START_POP = 2;
const MIN_POP = 1;
const EAT_PER_POP = 0.05;   // food eaten per Wexle per second
const GROW_RATE = 0.05;     // fractional growth per second when fed
const COST_PER_POP = 6;     // food to add one Wexle
const STARVE_RATE = 0.03;   // fractional decline per second when starving

export class Colony {
  constructor() {
    this.population = START_POP;
    this.peakPopulation = START_POP;
  }

  // Advance by `dtSeconds`, drawing from `harvest.resources.food`. Updates
  // `harvest.colonySize` so the harvest "As Needed" rate scales with the city.
  step(harvest, dtSeconds) {
    const eat = this.population * EAT_PER_POP * dtSeconds;
    if (harvest.resources.food >= eat) {
      let rem = harvest.resources.food - eat;
      const grow = this.population * GROW_RATE * dtSeconds;
      const cost = grow * COST_PER_POP;
      if (rem >= cost) { rem -= cost; this.population += grow; }
      harvest.resources.food = rem;
    } else {
      // Not enough food to feed everyone — the colony shrinks.
      harvest.resources.food = 0;
      this.population = Math.max(MIN_POP,
        this.population - this.population * STARVE_RATE * dtSeconds);
    }
    if (this.population > this.peakPopulation) this.peakPopulation = this.population;
    harvest.colonySize = this.population;
  }

  // Buildings unlocked at the current population.
  unlockedBuildings() {
    return BUILDINGS.filter(b => this.population >= b.pop);
  }
}
