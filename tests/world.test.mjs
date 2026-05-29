import { describe, test, eq, ok } from './harness.mjs';
import { World } from '../src/world.js';
import { Simulation } from '../src/simulation.js';
import {
  SPECIES, SPECIES_INDEX, TERRAIN, TERRAIN_INFO, NUM_SPECIES,
  classifyTerrain, coralHides, MIN_HABITABLE,
} from '../src/config.js';

describe('terrain', () => {
  test('classifyTerrain buckets fields into the right types', () => {
    eq(classifyTerrain(0.10, 0.5, 0.5), TERRAIN.DEEP_WATER, 'deep');
    eq(classifyTerrain(0.36, 0.5, 0.2), TERRAIN.SHALLOW_WATER, 'shallow');
    eq(classifyTerrain(0.60, 0.5, 0.9), TERRAIN.ROCK, 'rock');
    eq(classifyTerrain(0.60, 0.9, 0.1), TERRAIN.MUD, 'mud');
    eq(classifyTerrain(0.60, 0.1, 0.1), TERRAIN.SAND, 'sand');
    eq(classifyTerrain(0.60, 0.5, 0.1), TERRAIN.DIRT, 'loam');
  });

  test('generation is deterministic for a seed', () => {
    const a = new World();
    const b = new World();
    let same = true;
    for (let i = 0; i < a.terrain.length; i += 97) {
      if (a.terrain[i] !== b.terrain[i]) { same = false; break; }
    }
    ok(same, 'same seed => same terrain');
  });

  test('fields stay within [0,1]', () => {
    const w = new World();
    for (const f of w.fields) {
      for (let i = 0; i < f.length; i += 53) {
        ok(f[i] >= 0 && f[i] <= 1, `field in range (${f[i]})`);
      }
    }
  });

  test('every terrain type appears in the default world', () => {
    const w = new World();
    const counts = w.terrainCounts();
    for (let t = 0; t < TERRAIN_INFO.length; t++) {
      ok(counts[t] > 0, `${TERRAIN_INFO[t].id} present (${counts[t]})`);
    }
  });
});

describe('habitat', () => {
  test('a water species is habitable in water and not on dry highland', () => {
    const w = new World();
    const qelp = SPECIES[SPECIES_INDEX['qelp']];
    let inWater = 0, onLand = 0;
    for (let y = 0; y < w.height; y += 3) {
      for (let x = 0; x < w.width; x += 3) {
        const t = w.terrain[w.idx(x, y)];
        const suit = w.suitability(x, y, qelp);
        if (t === TERRAIN.SHALLOW_WATER && suit >= MIN_HABITABLE) inWater++;
        if (t === TERRAIN.ROCK && suit === 0) onLand++;
      }
    }
    ok(inWater > 0, 'qelp habitable in shallow water');
    ok(onLand > 0, 'qelp not habitable on rock');
  });

  test('coral reefs are generated on water cells', () => {
    const w = new World();
    const counts = w.terrainCounts();
    ok(counts[TERRAIN.CORAL] > 0, `coral present (${counts[TERRAIN.CORAL]})`);
  });

  test('coral hides prey only from non-refuge predators', () => {
    const ghoti = SPECIES[SPECIES_INDEX['ghoti']]; // coralRefuge: true
    const daot = SPECIES[SPECIES_INDEX['daot']];   // predator, no refuge
    ok(coralHides(daot, TERRAIN.CORAL), 'predator blocked by coral');
    ok(!coralHides(ghoti, TERRAIN.CORAL), 'refuge fish not blocked');
    ok(!coralHides(daot, TERRAIN.SHALLOW_WATER), 'open water never hides');
  });

  test('suitability is 0 outside the world', () => {
    const w = new World();
    const qelp = SPECIES[SPECIES_INDEX['qelp']];
    eq(w.suitability(-5, -5, qelp), 0, 'oob is 0');
  });

  test('every species seeds at least one individual', () => {
    const sim = new Simulation();
    for (let sp = 0; sp < NUM_SPECIES; sp++) {
      ok(sim.store.counts[sp] > 0, `${SPECIES[sp].id} seeded (${sim.store.counts[sp]})`);
    }
  });
});
