import { describe, test, eq, ok, approx } from './harness.mjs';
import { HarvestController, HARVEST_LEVELS } from '../src/harvest.js';
import { EntityStore } from '../src/entities.js';
import { SPECIES, SPECIES_INDEX, CONFIG } from '../src/config.js';

// Deterministic fake "sim": a store plus a fixed RNG so harvest picks are
// reproducible in tests.
function makeCtx() {
  const store = new EntityStore(1000);
  let seed = 1;
  const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  return { store, rand };
}

function spawnN(store, id, n) {
  const idx = SPECIES_INDEX[id];
  for (let k = 0; k < n; k++) store.spawn(idx, 1, 1, 10);
}

describe('harvest', () => {
  test('defaults to no harvesting', () => {
    const h = new HarvestController();
    for (const sp of SPECIES) {
      eq(h.getLevel(sp.id), 'none', `${sp.id} default`);
      eq(h.ratePerSecond(sp.index), 0, `${sp.id} rate`);
    }
  });

  test('levels are ordered none < some < a lot <= as needed', () => {
    const h = new HarvestController();
    const i = SPECIES_INDEX['latt'];
    h.setLevel('latt', 'none');  const none = h.ratePerSecond(i);
    h.setLevel('latt', 'some');  const some = h.ratePerSecond(i);
    h.setLevel('latt', 'alot');  const alot = h.ratePerSecond(i);
    h.setLevel('latt', 'asneeded'); const need = h.ratePerSecond(i);
    eq(none, 0, 'none is zero');
    ok(some > none, 'some > none');
    ok(alot > some, 'alot > some');
    ok(need >= alot, 'asneeded >= alot at colonySize 0');
  });

  test('"as needed" scales with colony size', () => {
    const h = new HarvestController();
    const i = SPECIES_INDEX['ghoti'];
    h.setLevel('ghoti', 'asneeded');
    h.colonySize = 0;   const small = h.ratePerSecond(i);
    h.colonySize = 500; const big = h.ratePerSecond(i);
    ok(big > small, 'higher colony size => faster as-needed harvest');
  });

  test('only valid levels are accepted', () => {
    const h = new HarvestController();
    let threw = false;
    try { h.setLevel('latt', 'bogus'); } catch { threw = true; }
    ok(threw, 'invalid level rejected');
    ok(HARVEST_LEVELS.length === 4, 'four levels exist');
  });

  test('fractional rate accumulates instead of removing every tick', () => {
    const ctx = makeCtx();
    spawnN(ctx.store, 'latt', 100);
    const h = new HarvestController();
    h.setLevel('latt', 'some'); // a slow trickle (< 1/sec expected)
    const i = SPECIES_INDEX['latt'];
    ok(h.ratePerSecond(i) < 1, 'precondition: some is a slow rate');
    h.step(ctx, 0.1); // 0.1s of a sub-1/s rate => fraction, nothing removed yet
    eq(ctx.store.counts[i], 100, 'no removal before a whole unit accumulates');
  });

  test('removes the expected number once a whole unit accumulates', () => {
    const ctx = makeCtx();
    spawnN(ctx.store, 'latt', 100);
    const h = new HarvestController();
    h.setLevel('latt', 'alot');
    const i = SPECIES_INDEX['latt'];
    const rate = h.ratePerSecond(i);
    h.step(ctx, 1.0); // one second at the "a lot" rate
    eq(ctx.store.counts[i], 100 - Math.floor(rate), 'removed floor(rate) in 1s');
    eq(h.harvestedTotal[i], Math.floor(rate), 'harvestedTotal tracks removals');
  });

  test('tallies wexle resources for removed organisms', () => {
    const ctx = makeCtx();
    spawnN(ctx.store, 'ghoti', 50);
    const h = new HarvestController();
    h.setLevel('ghoti', 'alot');
    const i = SPECIES_INDEX['ghoti'];
    h.step(ctx, 1.0);
    const removed = h.harvestedTotal[i];
    ok(removed > 0, 'something was harvested');
    const w = SPECIES[i].wexle;
    eq(h.resources.food, removed * w.food, 'food tally');
    eq(h.resources.material, removed * w.material, 'material tally');
    eq(h.resources.value, removed * w.value, 'value tally');
  });

  test('over-harvesting can drive a species to extinction', () => {
    const ctx = makeCtx();
    spawnN(ctx.store, 'latt', 5);
    const h = new HarvestController();
    h.setLevel('latt', 'asneeded');
    h.colonySize = 100000; // enormous demand
    const i = SPECIES_INDEX['latt'];
    h.step(ctx, 10.0);
    eq(ctx.store.counts[i], 0, 'population removed entirely');
    eq(h.harvestedTotal[i], 5, 'never removes more than existed');
  });

  test('untargeted species are untouched', () => {
    const ctx = makeCtx();
    spawnN(ctx.store, 'latt', 30);
    spawnN(ctx.store, 'ghoti', 30);
    const h = new HarvestController();
    h.setLevel('latt', 'alot'); // ghoti stays 'none'
    h.step(ctx, 1.0);
    eq(ctx.store.counts[SPECIES_INDEX['ghoti']], 30, 'ghoti untouched');
    ok(ctx.store.counts[SPECIES_INDEX['latt']] < 30, 'latt harvested');
  });
});
