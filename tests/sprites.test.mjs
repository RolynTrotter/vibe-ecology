// Sprite metadata + atlas indexing (pure logic; baking needs a canvas).
import { describe, test, ok, eq } from './harness.mjs';
import { SPECIES } from '../src/config.js';
import { SPRITES, FALLBACK, spriteFor } from '../src/sprites/critters.js';
import { MIPS, DETAIL_CELL, FIRST_DETAIL_MIP, mipFor, animalPose, plantPose, ANIM } from '../src/sprites/atlas.js';

describe('sprites', () => {
  test('every built-in species has its own sprite', () => {
    for (const sp of SPECIES) ok(SPRITES[sp.id], `no sprite for ${sp.id}`);
  });

  test('sprites carry the metadata the renderer needs', () => {
    for (const [id, s] of Object.entries({ ...SPRITES, fbA: FALLBACK.animal, fbP: FALLBACK.plant })) {
      ok(typeof s.draw === 'function', `${id}: draw`);
      ok(s.box > 0, `${id}: box`);
      const plant = 'frames' in s;
      if (plant) ok(s.frames >= 1 && (s.variants || 1) >= 1, `${id}: plant frames/variants`);
      else ok(s.move >= 1 && s.idle >= 1 && s.stride > 0, `${id}: animal move/idle/stride`);
      if (s.aerial) ok(s.altitude > 0, `${id}: aerial needs altitude`);
    }
  });

  test('unknown species fall back by kind', () => {
    eq(spriteFor({ id: 'zzz', kind: 'plant' }), FALLBACK.plant);
    eq(spriteFor({ id: 'zzz', kind: 'animal' }), FALLBACK.animal);
  });

  test('mips ascend and the detail threshold splits them', () => {
    for (let i = 1; i < MIPS.length; i++) ok(MIPS[i] > MIPS[i - 1], 'ascending');
    ok(MIPS[FIRST_DETAIL_MIP] >= DETAIL_CELL && MIPS[FIRST_DETAIL_MIP - 1] < DETAIL_CELL, 'split');
  });

  test('mipFor never upscales more than 1.3x (except past the top mip)', () => {
    let last = 0;
    for (let px = 1; px < 400; px += 0.5) {
      const m = mipFor(px);
      ok(m >= last, 'monotonic');
      last = m;
      if (m < MIPS.length - 1) ok(MIPS[m] * 1.3 >= px, `px ${px} -> ${MIPS[m]}`);
    }
  });

  test('pose indices are dense and unique', () => {
    const a = new Set();
    for (const baby of [false, true]) for (const an of [ANIM.MOVE, ANIM.IDLE, ANIM.DEAD]) for (const l of [false, true]) a.add(animalPose(baby, an, l));
    eq(a.size, 12); eq(Math.max(...a), 11);
    const p = new Set();
    for (const sp of [false, true]) for (let v = 0; v < 3; v++) for (const l of [false, true]) p.add(plantPose(sp, v, 3, l));
    eq(p.size, 12); eq(Math.max(...p), 11);
  });
});
