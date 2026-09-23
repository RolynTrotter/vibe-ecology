// ===========================================================================
//  atlas — bakes sprite poses into mipmapped sprite sheets, lazily.
//
//  A Sheet is one species at one resolution: every animation frame of every
//  pose, pre-mirrored for left-facing, packed into a single canvas so the
//  renderer's per-entity cost is one drawImage from a shared source. Sheets are
//  built the first time a zoom level needs them (and re-baked if a species'
//  colour changes in the dev tools).
//
//  Tiny mips bake at detail 0 — no ink outline or fine features — so a
//  far-away critter is a clean blob of its species colour; the renderer
//  crossfades to the outlined detail-1 mip as you zoom in.
// ===========================================================================
import { spriteFor } from './critters.js';
import { tint, deadTint, groundShadow } from './paint.js';

// Cell sizes in device pixels (~1.4× apart). The first two are the "far"
// detail-0 levels.
export const MIPS = [10, 20, 36, 50, 70, 98, 136];
export const DETAIL_CELL = 30;              // cells >= this bake with full detail
const PAD = 2;                              // gutter between cells (no bleed)
const COLS = 16;

// Pose indices. Animals: (age, anim, facing). Plants: (stage, variant, facing).
export const ANIM = { MOVE: 0, IDLE: 1, DEAD: 2 };
export const animalPose = (baby, anim, left) => ((baby ? 3 : 0) + anim) * 2 + (left ? 1 : 0);
export const plantPose = (sprout, variant, variants, left) => ((sprout ? variants : 0) + variant) * 2 + (left ? 1 : 0);

function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

// Enumerate [{params, frames}] for a sprite, in pose-index order.
function posesOf(sprite, isPlant, color) {
  const out = [];
  if (isPlant) {
    const V = sprite.variants || 1;
    for (const stage of ['adult', 'sprout']) {
      for (let v = 0; v < V; v++) {
        for (const left of [false, true]) {
          out.push({ n: sprite.frames || 1, left, p: { anim: 'sway', stage, variant: v, color } });
        }
      }
    }
    return out;
  }
  for (const baby of [false, true]) {
    const col = baby ? tint(color, 0.28) : color;
    for (const anim of ['move', 'idle', 'dead']) {
      for (const left of [false, true]) {
        const dead = anim === 'dead';
        const n = dead ? 1 : sprite[anim] || 1;
        out.push({ n, left, dead, p: { anim, baby, dead, color: dead ? deadTint(col) : col } });
      }
    }
  }
  return out;
}

export class Sheet {
  constructor(def, cell) {
    const sprite = spriteFor(def);
    const isPlant = def.kind === 'plant';
    const poses = posesOf(sprite, isPlant, def.color);
    const total = poses.reduce((a, p) => a + p.n, 0);
    const stride = cell + PAD;
    const rows = Math.ceil(total / COLS);
    this.cell = cell;
    this.stride = stride;
    this.canvas = makeCanvas(Math.min(total, COLS) * stride, rows * stride);
    this.start = new Int32Array(poses.length);
    this.len = new Int32Array(poses.length);
    // Precomputed source rects: sx/sy per frame index.
    this.sx = new Float32Array(total);
    this.sy = new Float32Array(total);

    const ctx = this.canvas.getContext('2d');
    ctx.__detail = cell >= DETAIL_CELL ? 1 : 0;
    const s = cell / 100;
    let idx = 0;
    poses.forEach((pose, pi) => {
      this.start[pi] = idx;
      this.len[pi] = pose.n;
      for (let f = 0; f < pose.n; f++, idx++) {
        const ox = (idx % COLS) * stride, oy = Math.floor(idx / COLS) * stride;
        this.sx[idx] = ox; this.sy[idx] = oy;
        ctx.save();
        ctx.beginPath(); ctx.rect(ox, oy, cell, cell); ctx.clip();
        if (pose.left) { ctx.translate(ox + cell, oy); ctx.scale(-s, s); }
        else { ctx.translate(ox, oy); ctx.scale(s, s); }
        const p = { ...pose.p, t: f / pose.n };
        if (pose.dead) {
          // Belly-up: shadow on the ground, then the idle pose flipped over.
          if (!sprite.aerial) groundShadow(ctx, 50, 86, 20, 5, 0.25);
          ctx.__noShadow = true;
          ctx.translate(50, 70); ctx.rotate(Math.PI); ctx.scale(0.8, 0.8); ctx.translate(-50, -60);
          sprite.draw(ctx, p);
          ctx.__noShadow = false;
        } else {
          sprite.draw(ctx, p);
        }
        ctx.restore();
      }
    });
  }

  // Frame index for pose `pi` at phase `t` in [0,1).
  frame(pi, t) {
    const n = this.len[pi];
    return this.start[pi] + (n > 1 ? ((t * n) | 0) % n : 0);
  }
}

// Caches sheets per (species, colour, mip).
export class SpriteBank {
  constructor() {
    this.sheets = new Map();
    this.shadow = null;
  }

  sheet(def, mip) {
    const key = def.id + '|' + def.color + '|' + mip;
    let sh = this.sheets.get(key);
    if (!sh) { sh = new Sheet(def, MIPS[mip]); this.sheets.set(key, sh); }
    return sh;
  }

  // Soft round shadow for fliers (drawn on the ground under their bodies).
  shadowSprite() {
    if (this.shadow) return this.shadow;
    const S = 64;
    const c = makeCanvas(S, S);
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, 'rgba(26,15,46,0.4)');
    g.addColorStop(0.6, 'rgba(26,15,46,0.25)');
    g.addColorStop(1, 'rgba(26,15,46,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
    this.shadow = c;
    return c;
  }
}

// The shared bank: the renderer, menu icons, and gallery all sample it, and
// its sheets survive world resets.
export const BANK = new SpriteBank();

// A species portrait (adult, idle, facing right) as a cached data: URL for
// menus; `px` is the device-pixel size of the square icon.
const iconCache = new Map();
export function iconURL(def, px = 48) {
  const key = def.id + '|' + def.color + '|' + px;
  let url = iconCache.get(key);
  if (url) return url;
  const c = document.createElement('canvas');
  c.width = c.height = px;
  drawIcon(c.getContext('2d'), def, px / 2, px / 2, px);
  url = c.toDataURL();
  iconCache.set(key, url);
  return url;
}

// Draw a species portrait centred at (x,y), `size` px square.
export function drawIcon(ctx, def, x, y, size) {
  const sheet = BANK.sheet(def, mipFor(size * 1.25));
  const sprite = spriteFor(def);
  const pose = def.kind === 'plant'
    ? plantPose(false, (sprite.variants || 1) - 1, sprite.variants || 1, false)
    : animalPose(false, ANIM.IDLE, false);
  const f = sheet.frame(pose, 0);
  const box = size * 1.25;                     // sprites sit in a padded box; crop in a little
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(sheet.canvas, sheet.sx[f], sheet.sy[f], sheet.cell, sheet.cell,
    x - box / 2, y - box * 0.6, box, box);
}

// Pick the mip for a sprite drawn `px` device pixels wide: the smallest cell
// that needs at most MAX_UPSCALE of stretch. Leaning on slight upscaling rather
// than downscaling matters: a software canvas (some Android devices, headless
// Chrome) takes a far slower filtering path to shrink an image than to grow it.
const MAX_UPSCALE = 1.3;
export function mipFor(px) {
  for (let m = 0; m < MIPS.length; m++) if (MIPS[m] * MAX_UPSCALE >= px) return m;
  return MIPS.length - 1;
}
export const FIRST_DETAIL_MIP = MIPS.findIndex(c => c >= DETAIL_CELL);
