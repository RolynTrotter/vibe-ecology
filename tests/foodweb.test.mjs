import { describe, test, ok, eq } from './harness.mjs';
import { trophicLevels, buildFoodWeb } from '../src/foodweb.js';
import { SPECIES, SPECIES_INDEX } from '../src/config.js';

const lvl = (id) => trophicLevels()[SPECIES_INDEX[id]];

describe('foodweb', () => {
  test('producers are level 0, consumers stack above their prey', () => {
    eq(lvl('qelp'), 0, 'qelp is a producer');
    eq(lvl('naze'), 0, 'naze is a producer');
    eq(lvl('ghoti'), 1, 'ghoti eats a producer');
    eq(lvl('latt'), 1, 'latt eats a producer');
    // Daot eats herbivores (level 1) -> level 2.
    eq(lvl('daot'), 2, 'daot eats herbivores');
    // Qraken eats Ghoti(1) and Daot(2) -> level 3.
    eq(lvl('qraken'), 3, 'qraken is apex');
  });

  test('buildFoodWeb groups by level and lists prey->predator edges', () => {
    const fw = buildFoodWeb();
    eq(fw.level.length, SPECIES.length, 'a level per species');
    ok(fw.byLevel[0].length > 0, 'has producers');
    ok(fw.maxLevel >= 3, 'web is at least 4 tiers deep');
    // Every Daot diet entry should appear as an edge into Daot.
    const di = SPECIES_INDEX['daot'];
    const ghoti = SPECIES_INDEX['ghoti'];
    ok(fw.edges.some(([from, to]) => from === ghoti && to === di),
      'ghoti -> daot edge exists');
  });
});
