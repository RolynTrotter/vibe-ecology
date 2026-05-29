// Headless sanity check for the simulation core (no DOM needed).
// Run: node tools/smoke_test.mjs
//
// It builds a world, seeds populations, runs a few thousand ticks, and asserts
// the sim doesn't crash, stays within the entity cap, and remains internally
// consistent (live count matches per-species tallies).
import { Simulation } from '../src/simulation.js';
import { SPECIES } from '../src/config.js';

const sim = new Simulation();
const TICKS = 3000;

function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); process.exit(1); }
}

let liveExpected = sim.store.living;
assert(liveExpected > 0, 'should seed some organisms');

const t0 = performance.now();
for (let i = 0; i < TICKS; i++) {
  sim.step();

  // Cross-check the per-species counts against the alive flags periodically.
  if (i % 500 === 0) {
    const tally = new Array(SPECIES.length).fill(0);
    let live = 0;
    for (let k = 0; k < sim.store.highWater; k++) {
      if (sim.store.alive[k]) { live++; tally[sim.store.species[k]]++; }
    }
    assert(live === sim.store.living, `living mismatch at tick ${i}`);
    for (let sp = 0; sp < SPECIES.length; sp++) {
      assert(tally[sp] === sim.store.counts[sp],
        `count mismatch for ${SPECIES[sp].id} at tick ${i}`);
    }
    assert(sim.store.living <= sim.store.capacity, 'exceeded capacity');
  }
}
const dt = performance.now() - t0;

const counts = [...sim.store.counts];
console.log(`Ran ${TICKS} ticks in ${dt.toFixed(0)}ms ` +
  `(${(dt / TICKS).toFixed(2)}ms/tick) with ${sim.store.living} organisms.`);
SPECIES.forEach((sp, i) => console.log(`  ${sp.name.padEnd(6)} ${counts[i]}`));
console.log('PASS');
