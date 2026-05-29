import { describe, test, ok, eq, approx } from './harness.mjs';
import { Colony, BUILDINGS } from '../src/colony.js';

function fakeHarvest(food = 0) {
  return { resources: { food, material: 0, value: 0 }, colonySize: 0 };
}

describe('colony', () => {
  test('starts with a small population and the founding building', () => {
    const c = new Colony();
    ok(c.population >= 1, 'has founders');
    ok(c.unlockedBuildings().some(b => b.id === 'pod'), 'landing pod present');
  });

  test('grows when fed and syncs colonySize onto harvest', () => {
    const c = new Colony();
    const h = fakeHarvest(5000);
    const start = c.population;
    for (let i = 0; i < 200; i++) c.step(h, 1.0);
    ok(c.population > start, `population grew (${start} -> ${c.population})`);
    eq(h.colonySize, c.population, 'colonySize mirrors population');
    ok(h.resources.food < 5000, 'food was consumed');
  });

  test('starves toward the floor without food', () => {
    const c = new Colony();
    c.population = 50;
    const h = fakeHarvest(0);
    for (let i = 0; i < 500; i++) c.step(h, 1.0);
    ok(c.population < 50, 'population declined');
    ok(c.population >= 1, 'never below the floor');
  });

  test('unlocks more buildings as population rises', () => {
    const c = new Colony();
    c.population = 1;
    const few = c.unlockedBuildings().length;
    c.population = 200;
    const many = c.unlockedBuildings().length;
    ok(many > few, 'more buildings at higher population');
    eq(many, BUILDINGS.length, 'all buildings unlocked when very large');
  });
});
