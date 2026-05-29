// NOTE: these tests mutate the global SPECIES roster, so this file is imported
// LAST in run.mjs (after all tests that assume the default roster).
import { describe, test, ok, eq } from './harness.mjs';
import { SPECIES, SPECIES_INDEX, CONFIG, createSpecies } from '../src/config.js';
import { Simulation } from '../src/simulation.js';

describe('dev: createSpecies', () => {
  test('appends a species and recomputes derived data', () => {
    const before = SPECIES.length;
    const sp = createSpecies({
      name: 'Newt', kind: 'animal', diet: ['naze'],
      habitat: { elevation: [0.42, 0.98] }, initial: 40,
    });
    eq(SPECIES.length, before + 1, 'roster grew');
    eq(SPECIES_INDEX['newt'], sp.index, 'index registered');
    ok(sp.dietMask & (1 << SPECIES_INDEX['naze']), 'diet bitmask set');
    ok(sp.bands.length >= 1, 'habitat bands computed');
    // Naze should now list Newt among its predators.
    const naze = SPECIES[SPECIES_INDEX['naze']];
    ok(naze.predatorMask & (1 << sp.index), 'prey predatorMask updated');
    eq(CONFIG.initial['newt'], 40, 'initial count registered');
  });

  test('rejects a duplicate id', () => {
    let threw = false;
    try { createSpecies({ name: 'Newt' }); } catch { threw = true; }
    ok(threw, 'duplicate rejected');
  });

  test('a fresh world seeds the created species and can inject more', () => {
    const sim = new Simulation();
    const idx = SPECIES_INDEX['newt'];
    ok(sim.store.counts[idx] > 0, `newt seeded (${sim.store.counts[idx]})`);
    const before = sim.store.counts[idx];
    const made = sim.spawnSpecies(SPECIES[idx], 30);
    ok(made > 0, 'injected some');
    eq(sim.store.counts[idx], before + made, 'counts reflect injection');
  });
});
