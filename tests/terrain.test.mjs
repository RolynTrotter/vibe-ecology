// Painted terrain: the continuous sampler agrees with the cell grid, tiles
// are deterministic, opaque inside the world, and seamless across edges.
import { describe, test, ok, eq, approx } from './harness.mjs';
import { World } from '../src/world.js';
import { CONFIG, TERRAIN, classifyTerrain } from '../src/config.js';
import { bakeTile, TILE, GUTTER } from '../src/terrain/art.js';
import { LEVELS, levelFor } from '../src/terrain/tiles.js';

// Minimal canvas stand-in: enough for the per-pixel pass (P < 16 skips the
// vector decorations, which need Path2D).
function fakeCanvas(w, h) {
  let img = null;
  return {
    width: w, height: h,
    getContext: () => ({
      createImageData: (a, b) => ({ width: a, height: b, data: new Uint8ClampedArray(a * b * 4) }),
      putImageData: (d) => { img = d; },
    }),
    get pixels() { return img; },
  };
}

const world = new World({ ...CONFIG.world, width: 60, height: 40 });

describe('terrain', () => {
  test('sample() reproduces the cell fields at integer points', () => {
    const v = [0, 0, 0, 0];
    for (const [x, y] of [[0, 0], [7, 3], [59, 39], [31, 20]]) {
      world.sample(x, y, v);
      const i = world.idx(x, y);
      approx(v[0], world.fields[0][i], 1e-6, 'elevation');
      approx(v[1], world.fields[1][i], 1e-6, 'moisture');
      approx(v[2], world.fields[2][i], 1e-6, 'rockiness');
      const t = classifyTerrain(v[0], v[1], v[2]);
      const cell = world.terrain[i];
      ok(cell === t || (cell === TERRAIN.CORAL && t <= TERRAIN.SHALLOW_WATER), 'type agrees');
    }
  });

  test('tiles are deterministic and opaque inside the world', () => {
    const a = bakeTile(world, 8, 0, 0, fakeCanvas).pixels.data;
    const b = bakeTile(world, 8, 0, 0, fakeCanvas).pixels.data;
    let same = true;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) { same = false; break; }
    ok(same, 'deterministic');
    const N = TILE + 2 * GUTTER;
    eq(a[((GUTTER + 10) * N + GUTTER + 10) * 4 + 3], 255, 'inside is opaque');
    // world is 60 units = 480px wide at P=8, so px 500 (in tile 1) is outside
    const c = bakeTile(world, 8, 1, 0, fakeCanvas).pixels.data;
    eq(c[((GUTTER + 10) * N + GUTTER + 250) * 4 + 3], 0, 'outside is transparent');
  });

  test('neighbouring tiles agree across the seam (gutter = neighbour edge)', () => {
    const N = TILE + 2 * GUTTER;
    const L = bakeTile(world, 4, 0, 0, fakeCanvas).pixels.data;
    const R = bakeTile(world, 4, 1, 0, fakeCanvas).pixels.data;
    let maxd = 0;
    for (let y = GUTTER; y < GUTTER + 60; y++) {
      const lg = (y * N + GUTTER + TILE) * 4;   // left tile's right gutter
      const re = (y * N + GUTTER) * 4;          // right tile's first content column
      for (let q = 0; q < 3; q++) maxd = Math.max(maxd, Math.abs(L[lg + q] - R[re + q]));
    }
    ok(maxd <= 1, `seam mismatch ${maxd}`);
  });

  test('levelFor only ever upscales, and by at most ~1.5x', () => {
    for (let px = LEVELS[0]; px < 90; px += 0.25) {
      const P = LEVELS[levelFor(px)];
      ok(P <= px * 1.02, `P ${P} for ${px}`);
      if (px <= LEVELS[LEVELS.length - 1]) ok(px / P < 1.5, `upscale ${px / P}`);
    }
  });
});
