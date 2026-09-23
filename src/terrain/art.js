// ===========================================================================
//  terrain/art — paints the ground in the same sticker style as the critters.
//
//  A tile is painted per pixel from the world's *continuous* fields (see
//  World.sample), so contours are smooth and crisp at any zoom instead of
//  following the cell grid. Every boundary is antialiased from the field's
//  value and gradient (signed distance ≈ (v - threshold) / |∇v|):
//    water   deep→shallow depth gradient, a pale shelf line, rippling caustics
//    shore   inked outline, white foam bands offshore, darker wet sand onshore
//    land    loam with mossy patches, rippled sand, glossy mud puddles, soft
//            soil borders, and gentle hillshade from the elevation slope
//    rock    lavender plates split by cracks, inked rim, drop shadow
//    reef    bumpy pink coral with polyps and an inked rim
//  At close zoom levels, decorations (grass tufts, flowers, shells, pebbles,
//  glowing crystals, reeds, lily pads) are scattered deterministically per
//  cell and drawn with the sprite paint kit, so they line up across tiles.
//
//  Pure (no DOM): runs in a Web Worker with OffscreenCanvas, or on the main
//  thread with a canvas factory.
// ===========================================================================
import { TERRAIN_THRESHOLDS as TH } from '../config.js';
import {
  TAU, shade, ellipse, circle, blobPath, sticker, flat, ribbon, glow,
} from '../sprites/paint.js';

export const TILE = 256;       // tile content size (px)
export const GUTTER = 1;       // extra px each side so bilinear seams sample real data

// ---- palette (0..255 triples) ------------------------------------------------
const C = {
  deep: [27, 74, 122], shallow: [58, 157, 201], shoal: [111, 208, 207],
  sand: [239, 217, 160], sandWet: [206, 176, 122],
  loam: [138, 106, 69], moss: [114, 128, 64], mud: [94, 70, 50], puddle: [62, 82, 104],
  rock: [163, 159, 180], rockDark: [120, 114, 142], crack: [96, 88, 120],
  coral: [236, 128, 150], coralRim: [150, 62, 108], coralPeach: [255, 160, 120], coralOrchid: [196, 128, 214], polyp: [255, 196, 214],
  ink: [42, 29, 61], foam: [240, 250, 255],
};

// ---- small maths ---------------------------------------------------------------
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const sstep = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
// Coverage of a region whose signed distance (px) is d: 0.5 at the edge.
const cov = (d) => clamp01(0.5 + d);
// Antialiased line of width w (px) centred on a signed distance d (px).
const lineAA = (d, w) => clamp01(w / 2 + 0.5 - Math.abs(d));

function hash2(x, y) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
// Smooth value noise in world space (continuous across tiles and zooms).
function vnoise(x, y) {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const tx = x - x0, ty = y - y0;
  const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
  const a = hash2(x0, y0), b = hash2(x0 + 1, y0);
  const c = hash2(x0, y0 + 1), d = hash2(x0 + 1, y0 + 1);
  return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
}

// Two rotated octaves of value noise: hides the lattice's square artifacts.
function soft(x, y) {
  const a = vnoise(x * 0.8 - y * 0.6, x * 0.6 + y * 0.8);
  const b = vnoise(x * 1.7 + y * 1.1 + 31, -x * 1.1 + y * 1.7);
  return a * 0.65 + b * 0.35;
}

// Worley cell noise: returns F2-F1 (crack distance) and writes the nearest
// cell's hash into CELL_ID (for per-plate tone).
let CELL_ID = 0, CELL_F1 = 0;
function worley(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  let f1 = 9, f2 = 9, id = 0;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const cx = xi + i, cy = yi + j;
      const px = cx + hash2(cx, cy + 71), py = cy + hash2(cx + 13, cy);
      const d = Math.hypot(px - x, py - y);
      if (d < f1) { f2 = f1; f1 = d; id = hash2(cx + 5, cy + 9); } else if (d < f2) f2 = d;
    }
  }
  CELL_ID = id; CELL_F1 = f1;
  return f2 - f1;
}

// ---- the painter ---------------------------------------------------------------
// Paint tile (tx,ty) at P px per world unit. Returns the canvas (TILE+2·GUTTER
// square; the gutter overlaps neighbours so the renderer can crop it off).
export function bakeTile(world, P, tx, ty, makeCanvas) {
  const N = TILE + 2 * GUTTER;          // output size
  const S = N + 2;                      // sample grid: 1 extra px each side for gradients
  const ox = tx * TILE - GUTTER - 1;    // pixel coord of sample (0,0)
  const oy = ty * TILE - GUTTER - 1;
  const E = new Float32Array(S * S), M = new Float32Array(S * S);
  const R = new Float32Array(S * S), K = new Float32Array(S * S);
  const v = [0, 0, 0, 0];
  const inv = 1 / P;
  for (let j = 0; j < S; j++) {
    // Cells sample the field at integer coords and cover [x, x+1): shift by half
    // a cell so a cell's centre shows exactly its simulated value.
    const fy = (oy + j + 0.5) * inv - 0.5;
    for (let i = 0; i < S; i++) {
      world.sample((ox + i + 0.5) * inv - 0.5, fy, v);
      const k = j * S + i;
      E[k] = v[0]; M[k] = v[1]; R[k] = v[2]; K[k] = v[3];
    }
  }

  const canvas = makeCanvas(N, N);
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(N, N);
  const out = img.data;
  const cThr = world.coralThreshold;
  const inkW = Math.min(4, Math.max(1.1, P * 0.06));
  const fadeFine = sstep(6, 20, P);             // world-scale fine texture visibility
  const fadeMid = sstep(3, 8, P);
  const rippleW = Math.max(0.9, P * 0.025);
  const foamW = Math.max(1.1, P * 0.07);
  const W = world.width, H = world.height;
  const col = [0, 0, 0];
  const setc = (a) => { col[0] = a[0]; col[1] = a[1]; col[2] = a[2]; };
  const mixc = (a, t) => {
    if (t <= 0) return;
    col[0] += (a[0] - col[0]) * t; col[1] += (a[1] - col[1]) * t; col[2] += (a[2] - col[2]) * t;
  };
  const lum = (f) => { col[0] *= f; col[1] *= f; col[2] *= f; };
  const land = [0, 0, 0], water = [0, 0, 0];
  const off = [0, 0, 0, 0];

  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const k = (y + 1) * S + (x + 1);
      const e = E[k], m = M[k], r = R[k], c = K[k];
      const gex = (E[k + 1] - E[k - 1]) * 0.5, gey = (E[k + S] - E[k - S]) * 0.5;
      const ge = Math.max(1e-7, Math.hypot(gex, gey));
      const wx = (ox + x + 1.5) * inv, wy = (oy + y + 1.5) * inv;   // world coords
      const ld = (e - TH.shoreline) / ge;                          // px from shore (+ = land)

      // ---------- water ----------
      setc(C.deep);
      mixc(C.shallow, sstep(0.14, 0.42, e));
      mixc(C.shoal, sstep(0.37, 0.42, e) * 0.55);
      // pale drop-off line where deep meets shallow
      mixc(C.foam, lineAA((e - TH.deepWater) / ge, Math.max(1, inkW * 0.7)) * 0.18);
      // rippling caustics: contour lines of a drifting noise field
      if (fadeMid > 0 && ld < 0) {
        const q = soft(wx * 0.7 + 40, wy * 0.7) * 3.2 + soft(wx * 0.2, wy * 0.2) * 2;
        const fq = q - Math.floor(q);
        const dq = Math.min(fq, 1 - fq) * P / 2.6;
        mixc(C.foam, lineAA(dq, rippleW) * fadeMid * (e > TH.deepWater ? 0.12 : 0.07));
      }
      // coral reef (only in water)
      if (c > cThr - 0.06 && ld < 1) {
        const gcx = (K[k + 1] - K[k - 1]) * 0.5, gcy = (K[k + S] - K[k - S]) * 0.5;
        const gc = Math.max(1e-7, Math.hypot(gcx, gcy));
        const cd = (c - cThr) / gc;
        const rc = cov(cd);
        if (rc > 0) {
          water[0] = col[0]; water[1] = col[1]; water[2] = col[2];
          setc(C.coral);
          mixc(C.coralRim, (1 - sstep(0, P * 0.3, cd)) * 0.7);   // darker rim just inside
          // coral heads: worley cells shaded as lumps, dark crevices between
          if (fadeMid > 0) {
            const gap = worley(wx * 1.6 + 50, wy * 1.6) * P / 1.6;
            // each head gets its own hue (pink / peach / orchid) and a rounded
            // shading: bright at its centre, darkening into the crevices
            const id = CELL_ID, f1 = CELL_F1;
            mixc(id < 0.33 ? C.coralPeach : id < 0.66 ? C.coral : C.coralOrchid, 0.6 * fadeMid);
            lum(1 + (0.45 - f1) * 0.6 * fadeMid);
            mixc(C.coralRim, (1 - sstep(0, P * 0.12, gap)) * 0.75 * fadeMid);
            // a few polyps
            const gx = wx * 3.1, gy = wy * 3.1;
            const cx = Math.floor(gx), cy = Math.floor(gy);
            if (hash2(cx + 7, cy) < 0.35) {
              const dpx = Math.hypot(gx - cx - 0.2 - hash2(cx, cy + 3) * 0.6, gy - cy - 0.2 - hash2(cx + 9, cy) * 0.6) * P / 3.1;
              mixc(C.polyp, cov(P * 0.05 - dpx) * 0.9 * fadeFine);
            }
          }
          // seen through the water: a little of the sea colour washes over it
          mixc(water, 0.28);
          const reef = [col[0], col[1], col[2]];
          setc(water);
          mixc(reef, rc);
          mixc(C.ink, lineAA(cd, inkW * 0.8) * 0.85);
        }
      }
      // foam bands offshore (broken up by noise)
      if (ld < 0) {
        const fd = -ld;
        const brk = vnoise(wx * 1.6, wy * 1.6);
        mixc(C.foam, lineAA(fd - P * 0.22, foamW) * 0.8 * sstep(0.3, 0.45, brk));
        mixc(C.foam, lineAA(fd - P * 0.55, foamW * 0.7) * 0.35 * sstep(0.45, 0.6, brk));
      }
      water[0] = col[0]; water[1] = col[1]; water[2] = col[2];

      // ---------- land ----------
      const aL = cov(ld);
      if (aL > 0) {
        const gmx = (M[k + 1] - M[k - 1]) * 0.5, gmy = (M[k + S] - M[k - S]) * 0.5;
        const gm = Math.max(1e-7, Math.hypot(gmx, gmy));
        const grx = (R[k + 1] - R[k - 1]) * 0.5, gry = (R[k + S] - R[k - S]) * 0.5;
        const gr = Math.max(1e-7, Math.hypot(grx, gry));

        // loam with mossy patches and fine grain
        setc(C.loam);
        mixc(C.moss, sstep(0.5, 0.7, soft(wx * 0.3 + 7, wy * 0.3)) * 0.75);
        lum(1 + (soft(wx * 2.2, wy * 2.2) - 0.5) * 0.14 * fadeFine);
        // sand (dry) with wind ripples
        const sd = (TH.dry - m) / gm / 1.4;
        const sc = cov(sd);
        if (sc > 0) {
          const sandC = [C.sand[0], C.sand[1], C.sand[2]];
          const rip = Math.sin((wx * 0.8 + wy * 0.45) * TAU * 1.3 + vnoise(wx * 0.4, wy * 0.4) * 7);
          const rl = 1 + rip * 0.045 * fadeFine + (soft(wx * 3, wy * 3) - 0.5) * 0.08 * fadeFine;
          sandC[0] *= rl; sandC[1] *= rl; sandC[2] *= rl;
          mixc(sandC, sc);
        }
        // mud (wet) with glossy puddles
        const md = (m - TH.wet) / gm / 1.4;
        const mc = cov(md);
        if (mc > 0) {
          const mudC = [C.mud[0], C.mud[1], C.mud[2]];
          const pn = vnoise(wx * 0.8 + 30, wy * 0.8);
          const pd = (pn - 0.66) * P / 1.0;
          const pc = cov(pd) * mc;
          mixc(mudC, mc);
          mixc(C.puddle, pc);
          mixc(C.foam, lineAA(pd - P * 0.12, Math.max(0.8, P * 0.03)) * pc * 0.5 * fadeMid);
        }
        // soft darker borders between soils
        const edge = lineAA(sd * 1.4, Math.max(1, inkW * 0.6)) * sc + lineAA(md * 1.4, Math.max(1, inkW * 0.6));
        lum(1 - 0.1 * clamp01(edge));

        // rock plateaus: plates, cracks, inked rim, drop shadow on the soil
        const rd = (r - TH.rocky) / gr;
        const rc = cov(rd);
        if (rd > -P * 0.6 && rc < 1 && r > TH.rocky - 0.12) {
          world.sample(wx - 0.5 - 0.2, wy - 0.5 - 0.3, off);          // rock up-left casts down-right
          const sh = cov((off[2] - TH.rocky) / gr) * (1 - rc);
          lum(1 - 0.28 * sh);
        }
        if (rc > 0) {
          const f = worley(wx * 1.1, wy * 1.1);
          const rockC = [0, 0, 0];
          const t = 0.85 + CELL_ID * 0.25;
          for (let q = 0; q < 3; q++) rockC[q] = (C.rock[q] * 0.7 + C.rockDark[q] * 0.3) * t;
          const crack = lineAA(f * P / 1.1, Math.max(0.8, P * 0.035)) * fadeMid;
          for (let q = 0; q < 3; q++) rockC[q] += (C.crack[q] - rockC[q]) * crack * 0.8;
          mixc(rockC, rc);
          mixc(C.ink, lineAA(rd, inkW) * 0.9);
        }

        // hillshade: lit from the upper-left
        const slope = (gex * 0.6 + gey * 0.8) * P;       // per world unit
        lum(1 + Math.max(-0.1, Math.min(0.1, slope * 4)));
        // wet sand/soil band hugging the shore
        const wet = 1 - sstep(0, P * 0.35 + 1, ld);
        if (wet > 0) { mixc(C.sandWet, wet * 0.5 * sc + wet * 0.2 * (1 - sc)); }

        land[0] = col[0]; land[1] = col[1]; land[2] = col[2];
        setc(water);
        mixc(land, aL);
      }
      // the inked shoreline
      mixc(C.ink, lineAA(ld, inkW) * 0.92);

      // outside the world rectangle: transparent (the renderer draws a frame)
      const o = (y * N + x) * 4;
      out[o] = col[0]; out[o + 1] = col[1]; out[o + 2] = col[2];
      out[o + 3] = wx < 0 || wy < 0 || wx > W || wy > H ? 0 : 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  if (P >= 16) scatterDecorations(ctx, world, P, ox + 1, oy + 1, N);
  return canvas;
}

// ---- decorations ---------------------------------------------------------------
// Terrain class at a world point, or -1 if it's too near a boundary to host
// a decoration without poking across it.
const DK = { WATER: 0, SAND: 1, LOAM: 2, MUD: 3, ROCK: 4, REEF: 5, DEEP: 6 };
function decoClass(world, x, y, v) {
  const cls = (px, py) => {
    world.sample(px - 0.5, py - 0.5, v);
    const e = v[0], m = v[1], r = v[2], c = v[3];
    if (e < TH.shoreline) return c > world.coralThreshold ? DK.REEF : e < TH.deepWater ? DK.DEEP : DK.WATER;
    if (r > TH.rocky) return DK.ROCK;
    if (m > TH.wet) return DK.MUD;
    if (m < TH.dry) return DK.SAND;
    return DK.LOAM;
  };
  const a = cls(x, y);
  if (cls(x - 0.35, y) !== a || cls(x + 0.35, y) !== a || cls(x, y - 0.5) !== a || cls(x, y + 0.25) !== a) return -1;
  return a;
}

// [draw, size (world units), probability per candidate] per class.
const DECO = {
  [DK.LOAM]: [[tuft, 0.6, 0.30], [flower, 0.5, 0.07], [glowBud, 0.5, 0.02]],
  [DK.SAND]: [[pebble, 0.32, 0.12], [shell, 0.38, 0.07], [starfish, 0.42, 0.015]],
  [DK.MUD]: [[reeds, 0.85, 0.12], [pebble, 0.28, 0.05]],
  [DK.ROCK]: [[pebble, 0.34, 0.14], [crystal, 0.62, 0.045]],
  [DK.WATER]: [[lilypad, 0.75, 0.02]],
  [DK.REEF]: [], [DK.DEEP]: [],
};

function scatterDecorations(ctx, world, P, px0, py0, N) {
  ctx.save();
  ctx.__detail = 1;
  const x0 = Math.floor(px0 / P) - 1, x1 = Math.ceil((px0 + N) / P) + 1;
  const y0 = Math.floor(py0 / P) - 1, y1 = Math.ceil((py0 + N) / P) + 1;
  const v = [0, 0, 0, 0];
  const items = [];
  for (let cy = Math.max(0, y0); cy < Math.min(world.height, y1); cy++) {
    for (let cx = Math.max(0, x0); cx < Math.min(world.width, x1); cx++) {
      for (let n = 0; n < 2; n++) {
        const h = hash2(cx * 3 + n, cy * 7 + 11);
        if (h > 0.4) continue;                                   // most candidates are empty
        const x = cx + hash2(cx + n * 17, cy + 3), y = cy + hash2(cy + n * 29, cx + 5);
        const k = decoClass(world, x, y, v);
        if (k < 0) continue;
        let roll = hash2(cx + 101, cy * 3 + n) * 0.5;           // < 0.5 → pick by cumulative prob
        for (const [fn, size, p] of DECO[k]) {
          if (roll < p) { items.push([y, x, fn, size, hash2(cx + n, cy + 99)]); break; }
          roll -= p;
        }
      }
    }
  }
  items.sort((a, b) => a[0] - b[0]);                             // back to front
  for (const [y, x, fn, size, h] of items) {
    const s = size * P / 100;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.translate(x * P - px0, y * P - py0);
    ctx.scale(h < 0.5 ? s : -s, s);                             // mirror half of them
    ctx.translate(-50, -86);
    fn(ctx, h);
  }
  ctx.restore();
}

// Decoration sprites: 100-box, anchor (50,86), like the critters.
function tuft(ctx, h) {
  const g = ['#7fb04e', '#8fc05a', '#6d9e44'][(h * 3) | 0];
  for (const [dx, lean, len] of [[-6, -14, 44], [0, 2, 56], [7, 16, 42], [-2, -4, 34]]) {
    const b = new Path2D();
    b.moveTo(50 + dx, 86);
    b.quadraticCurveTo(50 + dx + lean * 0.3, 86 - len * 0.6, 50 + dx + lean, 86 - len);
    ribbon(ctx, b, g, 5);
  }
}
function flower(ctx, h) {
  const st = new Path2D(); st.moveTo(50, 86); st.quadraticCurveTo(46, 70, 50, 54);
  ribbon(ctx, st, '#6d9e44', 4);
  const pc = ['#ffffff', '#ffb3d9', '#c9b3ff', '#fff08a'][(h * 4) | 0];
  for (let k = 0; k < 5; k++) {
    const a = k / 5 * TAU;
    sticker(ctx, ellipse(50 + Math.cos(a) * 9, 46 + Math.sin(a) * 9, 7.5, 6, a), pc, { off: [-1, -1.5] });
  }
  flat(ctx, circle(50, 46, 5), '#ffc84a');
}
function glowBud(ctx, h) {
  const st = new Path2D(); st.moveTo(50, 86); st.quadraticCurveTo(56, 66, 50, 50);
  ribbon(ctx, st, '#5f9e7a', 4);
  sticker(ctx, ellipse(44, 70, 9, 4, 0.5), '#7fb04e');
  glow(ctx, 50, 44, 8, h < 0.5 ? '#8ff5ff' : '#e7a6ff', 0.9);
}
function pebble(ctx, h) {
  const c = ['#b9b4c8', '#a7a0b5', '#c8bfae'][(h * 3) | 0];
  sticker(ctx, ellipse(50, 74, 30, 18), c, { gloss: [42, 66, 9, 4] });
  if (h > 0.6) sticker(ctx, ellipse(78, 80, 14, 9), shade(c, 0.1));
}
function shell(ctx, h) {
  const c = h < 0.5 ? '#ffc7d6' : '#ffe0b0';
  const fan = blobPath([[50, 88], [22, 60], [30, 40], [50, 32], [70, 40], [78, 60]]);
  sticker(ctx, fan, c, { gloss: [42, 46, 6, 4] });
  ctx.save(); ctx.clip(fan);
  ctx.strokeStyle = shade(c, 0.25); ctx.lineWidth = 3; ctx.lineCap = 'round';
  for (const a of [-0.8, -0.4, 0, 0.4, 0.8]) {
    ctx.beginPath(); ctx.moveTo(50, 86); ctx.lineTo(50 + Math.sin(a) * 50, 86 - Math.cos(a) * 50); ctx.stroke();
  }
  ctx.restore();
}
function starfish(ctx) {
  const pts = [];
  for (let k = 0; k < 10; k++) {
    const a = k / 10 * TAU - Math.PI / 2, rr = k % 2 ? 14 : 34;
    pts.push([50 + Math.cos(a) * rr, 66 + Math.sin(a) * rr * 0.8]);
  }
  sticker(ctx, blobPath(pts), '#ff9a5a', { gloss: [44, 56, 5, 3] });
  flat(ctx, circle(50, 66, 3), '#ffd0a8', false);
}
function reeds(ctx, h) {
  for (const [dx, lean, len] of [[-8, -6, 62], [0, 3, 76], [9, 9, 58]]) {
    const b = new Path2D();
    b.moveTo(50 + dx, 86); b.quadraticCurveTo(50 + dx, 86 - len * 0.5, 50 + dx + lean, 86 - len);
    ribbon(ctx, b, '#7a9a4a', 3.5);
    ctx.save(); ctx.translate(50 + dx + lean * 0.8, 86 - len * 0.82); ctx.rotate(lean * 0.02);
    sticker(ctx, ellipse(0, 0, 4.5, 11), '#8a5a36', { off: [-1, -1.5] });
    ctx.restore();
  }
  sticker(ctx, blobPath([[30, 86], [40, 70], [44, 86]]), '#6d9e44', { off: [-1, -1] });
}
function crystal(ctx, h) {
  const c = h < 0.5 ? '#8ff5ff' : '#d4a6ff';
  const g = ctx.createRadialGradient(50, 64, 0, 50, 64, 40);
  g.addColorStop(0, c + '88'); g.addColorStop(1, c + '00');
  ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(50, 70, 40, 24, 0, 0, TAU); ctx.fill();
  const shard = (x, a, len, w, col) => {
    ctx.save(); ctx.translate(x, 86); ctx.rotate(a);
    const p = new Path2D();
    p.moveTo(-w, 0); p.lineTo(-w, -len * 0.75); p.lineTo(0, -len); p.lineTo(w, -len * 0.75); p.lineTo(w, 0); p.closePath();
    sticker(ctx, p, col, { gloss: [-w * 0.4, -len * 0.6, w * 0.3, len * 0.2], off: [-w * 0.6, -2] });
    ctx.restore();
  };
  shard(40, -0.45, 38, 7, shade(c, 0.12));
  shard(62, 0.4, 32, 6.5, shade(c, 0.06));
  shard(51, -0.05, 56, 9, c);
}
function lilypad(ctx, h) {
  const pad = new Path2D();
  pad.moveTo(50, 70);
  pad.ellipse(50, 70, 36, 16, 0, 0.35, TAU - 0.05);
  pad.closePath();
  sticker(ctx, pad, '#6fbf5a', { gloss: [38, 64, 9, 3], off: [-2, -2] });
  if (h > 0.55) {
    for (let k = 0; k < 5; k++) {
      const a = k / 5 * TAU;
      sticker(ctx, ellipse(46 + Math.cos(a) * 6, 60 + Math.sin(a) * 4, 6, 4, a), '#ffb3d9', { off: [-1, -1] });
    }
    flat(ctx, circle(46, 60, 3.5), '#ffe27a', false);
  }
}
