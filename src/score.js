// ===========================================================================
//  Ecosystem health score. Rewards keeping every species alive and roughly
//  balanced; punishes extinctions and runaway/collapsing populations.
//  Range 0..100. (Colony/economy scoring will layer on later.)
// ===========================================================================
import { SPECIES, NUM_SPECIES, CONFIG } from './config.js';

export function ecosystemHealth(counts) {
  let alive = 0;
  let balance = 0;
  for (let sp = 0; sp < NUM_SPECIES; sp++) {
    const c = counts[sp];
    const base = CONFIG.initial[SPECIES[sp].id] || 1;
    if (c > 0) alive++;
    // Closeness to a "healthy" band (0.25x .. 3x of the starting population),
    // measured in log space so over- and under-population are treated fairly.
    const ratio = c / base;
    let band;
    if (c <= 0) band = 0;
    else {
      const l = Math.log2(ratio);            // 0 at baseline
      band = Math.max(0, 1 - Math.abs(l) / 2.5); // ~0 once 5-6x off baseline
    }
    balance += band;
  }
  const presence = alive / NUM_SPECIES;       // fraction of species surviving
  balance /= NUM_SPECIES;
  // Presence dominates — an extinction should hurt a lot.
  const score = (presence * 0.6 + balance * 0.4) * 100;
  return { score: Math.round(score), alive, presence, balance };
}
