// ===========================================================================
//  gallery — the sprite sheet viewer (sprites.html). Shows every species'
//  poses animating at full size on its home terrain, plus the LOD ladder
//  (each mip at its native pixel size) so the zoom transition can be tuned.
// ===========================================================================
import { SPECIES, TERRAIN, TERRAIN_INFO } from './config.js';
import { terrainTexel } from './textures.js';
import { spriteFor, ANCHOR } from './sprites/critters.js';
import { BANK as bank, MIPS, ANIM, animalPose, plantPose } from './sprites/atlas.js';
import { drawColonyScene } from './sprites/colony_scene.js';

const dpr = Math.min(window.devicePixelRatio || 1, 3);
const TOP = MIPS.length - 1;

// Which terrain each species is shown standing on.
const HOME = {
  qelp: TERRAIN.SHALLOW_WATER, ghoti: TERRAIN.SHALLOW_WATER, qraken: TERRAIN.DEEP_WATER,
  naze: TERRAIN.DIRT, latt: TERRAIN.DIRT, mmmapple: TERRAIN.DIRT, eagul: TERRAIN.DIRT,
  cacta: TERRAIN.SAND, muss: TERRAIN.ROCK, unclet: TERRAIN.ROCK, dinsopu: TERRAIN.MUD,
  necrow: TERRAIN.SAND,
};

// Paint a textured terrain swatch (reuses the map's texel generator).
const swatches = new Map();
function swatch(type, w, h) {
  const key = type + ':' + w + 'x' + h;
  if (swatches.has(key)) return swatches.get(key);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const t = terrainTexel(type, x >> 1, y >> 1);
    const o = (y * w + x) * 4;
    img.data[o] = t.r; img.data[o + 1] = t.g; img.data[o + 2] = t.b; img.data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  swatches.set(key, c);
  return c;
}

const cards = [];
const root = document.getElementById('gallery');

function card(def) {
  const el = document.createElement('section');
  el.className = 'card';
  const sprite = spriteFor(def);
  const isPlant = def.kind === 'plant';
  const tags = [def.kind];
  if (sprite.aerial) tags.push('flies');
  if (sprite.flat) tags.push('ground cover');
  if (def.canopy) tags.push('canopy');
  el.innerHTML = `<h2><span class="dot" style="background:${def.color}"></span>${def.name}
    <small>${tags.join(' · ')}</small></h2>`;
  const cv = document.createElement('canvas');
  el.appendChild(cv);
  const cap = document.createElement('div');
  cap.className = 'cap';
  cap.textContent = isPlant
    ? `variants ×${sprite.variants || 1} (mirrored ×2) · sprout · ${sprite.frames}-frame sway`
    : `move ×${sprite.move} · idle ×${sprite.idle} · baby · carcass`;
  el.appendChild(cap);
  root.appendChild(el);
  cards.push({ def, sprite, cv, isPlant });
}

SPECIES.forEach(card);

// Colony scene card (full-width).
const colonyCard = document.createElement('section');
colonyCard.className = 'card wide';
colonyCard.innerHTML = '<h2>Wexle colony <small>Colony tab scene · drag the slider to grow it</small></h2>';
const colonyCanvas = document.createElement('canvas');
colonyCanvas.className = 'colony';
const slider = document.createElement('input');
slider.type = 'range'; slider.min = 1; slider.max = 140; slider.value = 60;
const popLabel = document.createElement('span');
colonyCard.append(colonyCanvas, slider, popLabel);
root.prepend(colonyCard);

const BOX = 112;        // CSS px per pose tile
const LOD_H = Math.max(70, MIPS[MIPS.length - 1] / dpr + 26);   // fits the biggest mip

function layout(c) {
  const poses = c.isPlant ? (c.sprite.variants || 1) + 1 : 4;
  const w = Math.max(poses * BOX, MIPS.reduce((a, m) => a + Math.max(m / dpr, 26) + 12, 20));
  const h = BOX + LOD_H;
  c.cv.style.width = w + 'px';
  c.cv.style.height = h + 'px';
  c.cv.width = w * dpr; c.cv.height = h * dpr;
  c.w = w; c.h = h; c.poses = poses;
}
cards.forEach(layout);

function blit(ctx, sheet, fi, x, y, size) {
  ctx.drawImage(sheet.canvas, sheet.sx[fi], sheet.sy[fi], sheet.cell, sheet.cell,
    x - size * ANCHOR[0], y - size * ANCHOR[1], size, size);
}

function drawCard(c, now) {
  const ctx = c.cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = true;
  const home = HOME[c.def.id] ?? (c.isPlant ? TERRAIN.DIRT : TERRAIN.SAND);
  ctx.drawImage(swatch(home, Math.ceil(c.w / 2), Math.ceil(BOX / 2)), 0, 0, c.w, BOX);
  ctx.fillStyle = '#10151d';
  ctx.fillRect(0, BOX, c.w, LOD_H);
  const top = bank.sheet(c.def, TOP);
  const secs = now / 1000;
  const size = BOX * 0.98;
  const gy = BOX * 0.9;
  const sw = c.sprite;

  if (c.isPlant) {
    const V = sw.variants || 1;
    const t = (secs * 0.4) % 1;
    for (let v = 0; v < V; v++) {
      blit(ctx, top, top.frame(plantPose(false, v, V, v === 1), (t + v * 0.3) % 1), BOX * (v + 0.5), gy, size);
    }
    blit(ctx, top, top.frame(plantPose(true, 0, V, false), t), BOX * (V + 0.5), gy, size * 0.8);
  } else {
    const lift = sw.aerial ? sw.altitude * size * 0.6 : 0;
    const tm = (secs * 1.6) % 1, ti = (secs * 0.55) % 1;
    const tiles = [
      [animalPose(false, ANIM.MOVE, false), tm, 1, lift],
      [animalPose(false, ANIM.IDLE, true), ti, 1, sw.aerial && c.def.id !== 'necrow' ? lift : 0],
      [animalPose(true, ANIM.MOVE, false), (tm * 1.2) % 1, 0.7, lift * 0.7],
      [animalPose(false, ANIM.DEAD, false), 0, 1, 0],
    ];
    tiles.forEach(([pose, t, s, l], k) => {
      const x = BOX * (k + 0.5);
      if (l > 0) {
        const sh = bank.shadowSprite();
        const r = size * s * 0.34;
        ctx.drawImage(sh, x - r, gy - r * 0.35, r * 2, r * 0.7);
      }
      blit(ctx, top, top.frame(pose, t), x, gy - l, size * s);
    });
  }

  // LOD ladder: each mip at its native device size (tiny ones are the far view).
  let x = 10;
  ctx.fillStyle = '#7d8a99';
  ctx.font = '10px system-ui';
  ctx.textAlign = 'center';
  for (let m = 0; m < MIPS.length; m++) {
    const sh = bank.sheet(c.def, m);
    const px = MIPS[m] / dpr;
    const pose = c.isPlant ? plantPose(false, 1 % (sw.variants || 1), sw.variants || 1, false)
      : animalPose(false, ANIM.MOVE, false);
    const cx = x + px / 2;
    blit(ctx, sh, sh.frame(pose, (secs * 0.8) % 1), cx, BOX + 12 + px * ANCHOR[1], px);
    ctx.fillText(MIPS[m] + 'px', cx, BOX + LOD_H - 4);
    x += Math.max(px, 26) + 12;
  }
}

function drawColony(now) {
  const w = colonyCanvas.clientWidth, h = 220;
  if (colonyCanvas.width !== Math.round(w * dpr)) {
    colonyCanvas.width = Math.round(w * dpr); colonyCanvas.height = h * dpr;
    colonyCanvas.style.height = h + 'px';
  }
  const ctx = colonyCanvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const pop = +slider.value;
  popLabel.textContent = ` population ${pop}`;
  drawColonyScene(ctx, w, h, pop, now / 1000);
}

function frame(now) {
  cards.forEach(c => drawCard(c, now));
  drawColony(now);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
