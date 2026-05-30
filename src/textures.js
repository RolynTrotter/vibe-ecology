// ===========================================================================
//  Textures — procedural per-terrain texels and field color ramps. Pure
//  functions (deterministic given coordinates), used to bake the static map
//  layers once. No image assets: each terrain gets a base color modulated by
//  low-frequency mottle + high-frequency speckle, with a couple of type quirks.
// ===========================================================================
import { TERRAIN, TERRAIN_INFO } from './config.js';

function hexToRgb(hex) {
  const v = parseInt(hex.slice(1), 16);
  return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
}
const BASE = TERRAIN_INFO.map(t => hexToRgb(t.color));

// Per-terrain texture character: mottle (low-freq) + speckle (high-freq) amps.
const TEX = {
  [TERRAIN.DEEP_WATER]: { mottle: 0.10, speckle: 0.05, ripple: 0.06 },
  [TERRAIN.SHALLOW_WATER]: { mottle: 0.12, speckle: 0.06, ripple: 0.08 },
  [TERRAIN.SAND]: { mottle: 0.10, speckle: 0.18, ripple: 0 },
  [TERRAIN.DIRT]: { mottle: 0.20, speckle: 0.12, ripple: 0 },
  [TERRAIN.MUD]: { mottle: 0.24, speckle: 0.10, ripple: 0 },
  [TERRAIN.ROCK]: { mottle: 0.30, speckle: 0.14, ripple: 0 },
  [TERRAIN.CORAL]: { mottle: 0.16, speckle: 0.20, ripple: 0 },
};

// Integer hash -> [0,1).
function hash2(x, y) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
// Smoothly-interpolated hash for low-frequency mottle.
function smoothHash(x, y) {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const tx = x - x0, ty = y - y0;
  const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
  const a = hash2(x0, y0), b = hash2(x0 + 1, y0);
  const c = hash2(x0, y0 + 1), d = hash2(x0 + 1, y0 + 1);
  return (a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy;
}
function clamp255(v) { return v < 0 ? 0 : v > 255 ? 255 : v | 0; }

// Color of a terrain `type` at device pixel (px,py). Returns {r,g,b}.
export function terrainTexel(type, px, py) {
  const base = BASE[type] || BASE[TERRAIN.DIRT];
  const p = TEX[type] || TEX[TERRAIN.DIRT];
  const mottle = (smoothHash(px / 5, py / 5) - 0.5) * p.mottle;
  const speckle = (hash2(px, py) - 0.5) * p.speckle;
  let lum = 1 + mottle + speckle;
  // Water gets gentle horizontal ripples; rock gets darker fracture lines.
  if (p.ripple) lum += Math.sin(py * 0.5 + smoothHash(px / 8, py / 8) * 6) * p.ripple * 0.5;
  if (type === TERRAIN.ROCK && smoothHash(px / 7 + 11, py / 7) > 0.78) lum -= 0.22;
  return { r: clamp255(base.r * lum), g: clamp255(base.g * lum), b: clamp255(base.b * lum) };
}

// Color ramp for visualizing a continuous field (value in [0,1]).
// field: 0 elevation, 1 moisture, 2 rockiness.
export function fieldRamp(field, v) {
  v = v < 0 ? 0 : v > 1 ? 1 : v;
  if (field === 0) { // elevation: deep blue -> shore -> green -> brown -> white
    const stops = [
      [0.00, [20, 50, 90]], [0.30, [40, 110, 160]], [0.42, [210, 200, 150]],
      [0.60, [70, 140, 70]], [0.80, [120, 95, 60]], [1.00, [235, 235, 240]],
    ];
    return rampLookup(stops, v);
  }
  if (field === 1) { // moisture: dry tan -> wet blue
    return rampLookup([[0, [200, 180, 120]], [0.5, [110, 150, 110]], [1, [50, 110, 170]]], v);
  }
  // rockiness: soft dark -> hard grey/white
  return rampLookup([[0, [40, 70, 45]], [0.6, [120, 120, 110]], [1, [225, 225, 230]]], v);
}

function rampLookup(stops, v) {
  for (let i = 1; i < stops.length; i++) {
    if (v <= stops[i][0]) {
      const [t0, c0] = stops[i - 1], [t1, c1] = stops[i];
      const f = (v - t0) / (t1 - t0 || 1);
      return {
        r: clamp255(c0[0] + (c1[0] - c0[0]) * f),
        g: clamp255(c0[1] + (c1[1] - c0[1]) * f),
        b: clamp255(c0[2] + (c1[2] - c0[2]) * f),
      };
    }
  }
  const last = stops[stops.length - 1][1];
  return { r: last[0], g: last[1], b: last[2] };
}
