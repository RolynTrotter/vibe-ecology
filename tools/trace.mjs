// Print population trajectory to diagnose ecosystem stability.
// Run: node tools/trace.mjs [ticks] [every]
import { Simulation } from '../src/simulation.js';
import { SPECIES } from '../src/config.js';

const TICKS = parseInt(process.argv[2] || '4000', 10);
const EVERY = parseInt(process.argv[3] || '200', 10);
const sim = new Simulation();

const header = 'tick   ' + SPECIES.map(s => s.name.padStart(6)).join(' ');
console.log(header);
function row(t) {
  console.log(String(t).padStart(5) + '  ' +
    [...sim.store.counts].map(c => String(c).padStart(6)).join(' '));
}
row(0);
for (let i = 1; i <= TICKS; i++) {
  sim.step();
  if (i % EVERY === 0) row(i);
}
