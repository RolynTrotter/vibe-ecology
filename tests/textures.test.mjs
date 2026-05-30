import { describe, test, ok } from './harness.mjs';
import { terrainTexel, fieldRamp } from '../src/textures.js';
import { TERRAIN } from '../src/config.js';

const inByte = (c) => c.r >= 0 && c.r <= 255 && c.g >= 0 && c.g <= 255 &&
  c.b >= 0 && c.b <= 255 && Number.isInteger(c.r);

describe('textures', () => {
  test('terrainTexel returns in-range bytes for every terrain type', () => {
    for (const type of Object.values(TERRAIN)) {
      for (let k = 0; k < 50; k++) {
        const c = terrainTexel(type, k * 7, k * 13);
        ok(inByte(c), `type ${type} texel in range`);
      }
    }
  });

  test('terrainTexel is deterministic', () => {
    const a = terrainTexel(TERRAIN.ROCK, 42, 99);
    const b = terrainTexel(TERRAIN.ROCK, 42, 99);
    ok(a.r === b.r && a.g === b.g && a.b === b.b, 'same input -> same color');
  });

  test('fieldRamp stays in range and varies across the domain', () => {
    for (let field = 0; field < 3; field++) {
      const lo = fieldRamp(field, 0), hi = fieldRamp(field, 1);
      ok(inByte(lo) && inByte(hi), `field ${field} endpoints in range`);
      ok(lo.r !== hi.r || lo.g !== hi.g || lo.b !== hi.b, `field ${field} varies`);
      ok(inByte(fieldRamp(field, -5)) && inByte(fieldRamp(field, 9)), 'clamps OOB');
    }
  });
});
