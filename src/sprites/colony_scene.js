// ===========================================================================
//  colony_scene — the illustrated Wexle lagoon town shown in the Colony tab.
//
//  Stateless: everything is a function of (population, time), so it can be
//  redrawn every frame the tab is open. A cutaway at the waterline: floating
//  buildings ride the swell, seabed buildings sit under the water, stilted
//  ones reach through the surface. Buildings rise as the population passes
//  their unlock threshold; the next locked one shows as a cyan hologram
//  blueprint; Wexles (one per citizen, capped) stroll the dock or swim below.
// ===========================================================================
import { BUILDINGS } from '../colony.js';
import {
  INK, TAU, wave, mix, shade, tint, rng, alpha,
  ellipse, circle, puffs, blobPath,
  sticker, flat, ribbon, outline, eye, blush, mouth, glow, groundShadow,
} from './paint.js';
import { SPRITES } from './critters.js';

const WEXLE_COLORS = ['#8fe3b0', '#b9a4f5', '#ffc29e', '#9ad8f5', '#f7a8cf', '#e8e07a'];
const MAX_WEXLES = 26;

const smooth = (a, b, v) => { const k = Math.max(0, Math.min(1, (v - a) / (b - a))); return k * k * (3 - 2 * k); };

// ---- Wexle ----------------------------------------------------------------
// A bean-shaped alien with long floppy ears. Drawn in the 100-box (anchor
// 50,86) like the critters; `t` is its walk phase, `carry` a held item.
export function drawWexle(ctx, p) {
  const c = p.color, t = p.t;
  const walking = p.walk;
  const bob = walking ? -Math.abs(wave(t)) * 4 : wave(t) * 0.8;
  const step = walking ? wave(t) * 5 : 0;
  const earSw = walking ? wave(t, 1, 0.2) * 0.25 : wave(t, 0.5) * 0.08;
  if (!p.swim) groundShadow(ctx, 50, 86, 16, 4.5, 0.3);

  // back foot
  sticker(ctx, ellipse(45 - step, 84, 6.5, 3.8), shade(c, 0.35));
  // back ear
  const ear = (x, y, a, col) => {
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    const e = blobPath([[0, 0], [-7, -4], [-18, 6], [-20, 20], [-13, 22], [-6, 10]]);
    sticker(ctx, e, col, { off: [-1.5, -2] });
    ctx.restore();
  };
  ear(42, 36 + bob, -0.1 + earSw, shade(c, 0.12));
  // body
  const body = blobPath([[34, 82], [31, 58], [37, 38 + bob], [52, 30 + bob], [65, 38 + bob], [69, 58], [66, 82], [50, 86]]);
  sticker(ctx, body, c, { gloss: [42, 42 + bob, 5, 3] });
  ctx.save(); ctx.clip(body);
  ctx.fillStyle = tint(c, 0.5);
  ctx.beginPath(); ctx.ellipse(54, 74, 12, 11, 0, 0, TAU); ctx.fill();
  ctx.restore();

  // satchel strap + bag (every Wexle is on an errand)
  if (p.bag) {
    const s = new Path2D(); s.moveTo(40, 44 + bob); s.lineTo(60, 70);
    ribbon(ctx, s, '#7a5236', 2.2);
    sticker(ctx, blobPath([[30, 62], [42, 60], [43, 72], [31, 73]]), '#c98a4b', { off: [-1, -1.5] });
  }
  // front ear
  ear(58, 34 + bob, 0.15 - earSw, c);
  // face
  eye(ctx, 50, 48 + bob, 5.2, p.blink ? 'happy' : 'open', [p.face, 0]);
  eye(ctx, 62, 48 + bob, 5.2, p.blink ? 'happy' : 'open', [p.face, 0]);
  blush(ctx, 46, 57 + bob, 3.4);
  blush(ctx, 66, 57 + bob, 3.4);
  mouth(ctx, 56, 58 + bob, 4.5, 'smile');
  // carried item, held up front
  if (p.carry === 'naze') {
    ctx.save(); ctx.translate(70, 60 + bob); ctx.rotate(0.5);
    sticker(ctx, ellipse(0, 0, 5, 9), '#d4c24a', { gloss: [-2, -4, 1.5, 2.5] });
    ctx.restore();
  } else if (p.carry === 'apple') {
    sticker(ctx, puffs([[69, 62 + bob, 4.5], [73, 62 + bob, 4.5]]), '#ff5f8f', { gloss: [69, 60 + bob, 1.5, 1] });
  } else if (p.carry === 'crate') {
    sticker(ctx, blobPath([[62, 54 + bob], [78, 54 + bob], [78, 68 + bob], [62, 68 + bob]]), '#b98a5a', { off: [-1, -1.5] });
  }
  // front foot
  sticker(ctx, ellipse(56 + step, 85, 6.5, 3.8), shade(c, 0.2));
  // swimmers wear a fishbowl helmet
  if (p.helmet) {
    const bowl = circle(54, 46 + bob, 25);
    ctx.fillStyle = 'rgba(200,245,255,0.22)'; ctx.fill(bowl);
    outline(ctx, bowl, 2.6);
    ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(54, 46 + bob, 19, Math.PI * 1.15, Math.PI * 1.45); ctx.stroke();
    sticker(ctx, ellipse(54, 70 + bob, 22, 5), '#9aa3bc', { off: [-1, -1] });   // collar ring
  }
}

// ---- Buildings (local coords: ground-centre at 0,0, up is -y, ~px) --------
// Buildings take (ctx, t, lift): `lift` is how far (local units) the
// waterline sits above a seabed-anchored building's base, so tall structures
// can reach the surface. Surface buildings have their origin at the waterline.
const B = {
  // Floating landing pod: a saucer riding on an inflatable float ring.
  pod(ctx, t) {
    sticker(ctx, ellipse(0, 1, 38, 6), '#ff9a6a', { gloss: [-16, -1, 8, 2] });   // float ring
    const hull = ellipse(0, -10, 32, 10);
    sticker(ctx, hull, '#c8d0e0', { gloss: [-12, -15, 10, 3] });
    const dome = new Path2D(); dome.ellipse(0, -16, 17, 15, 0, Math.PI, TAU); dome.closePath();
    ctx.fillStyle = 'rgba(150,230,255,0.55)'; ctx.fill(dome); outline(ctx, dome);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath(); ctx.ellipse(-7, -24, 4, 2.5, -0.5, 0, TAU); ctx.fill();
    for (let k = 0; k < 5; k++) {                           // chasing hull lights
      const on = ((t * 3) | 0) % 5 === k;
      glow(ctx, -22 + k * 11, -8, 2, on ? '#fff08a' : '#7ad0ff', on ? 1 : 0.4);
    }
  },
  hatchery(ctx, t) {
    groundShadow(ctx, 0, 0, 26, 5, 0.35);
    const egg = blobPath([[-22, 0], [-22, -22], [-12, -44], [0, -50], [12, -44], [22, -22], [22, 0]]);
    sticker(ctx, egg, '#f3e6c8', { gloss: [-9, -36, 5, 8] });
    ctx.save(); ctx.clip(egg);
    ctx.fillStyle = '#e2c79a';
    for (const [x, y] of [[-10, -12], [12, -26], [-4, -40], [14, -8]]) { ctx.beginPath(); ctx.arc(x, y, 3, 0, TAU); ctx.fill(); }
    ctx.restore();
    const win = ellipse(0, -20, 11, 9);
    ctx.fillStyle = '#2b2350'; ctx.fill(win);
    for (let k = 0; k < 3; k++) {
      const wob = wave(t, 0.7, k * 0.33) * 0.25;
      ctx.save(); ctx.translate(-6 + k * 6, -17); ctx.rotate(wob);
      glow(ctx, 0, -2, 2.6, ['#8fe3b0', '#b9a4f5', '#ffc29e'][k], 0.8);
      ctx.restore();
    }
    outline(ctx, win);
    const door = blobPath([[-6, 0], [-6, -7], [0, -10], [6, -7], [6, 0]]);
    flat(ctx, door, '#9a6a4a');
    risingBubbles(ctx, t, 0, -50, 3);
  },
  // Stilt silo: legs from the seabed up through the surface, tank above it.
  granary(ctx, t, lift) {
    groundShadow(ctx, 0, 0, 20, 4.5, 0.35);
    const legs = new Path2D();
    for (const x of [-13, 13]) { legs.moveTo(x, 0); legs.lineTo(x * 0.8, -lift - 4); }
    legs.moveTo(-12, -lift * 0.35); legs.lineTo(12, -lift * 0.65);
    legs.moveTo(12, -lift * 0.35); legs.lineTo(-12, -lift * 0.65);
    ribbon(ctx, legs, '#8a7f99', 3.2);
    sticker(ctx, blobPath([[-22, -lift - 2], [22, -lift - 2], [22, -lift - 8], [-22, -lift - 8]]), '#b98a5a', { off: [-1, -1] });
    ctx.save(); ctx.translate(0, -lift - 8);
    const silo = blobPath([[-16, 0], [-16, -52], [16, -52], [16, 0]]);
    sticker(ctx, silo, '#d97b5a', { gloss: [-9, -40, 3, 12], off: [-4, -2] });
    ctx.save(); ctx.clip(silo);
    ctx.fillStyle = '#d4c24a';
    ctx.fillRect(-16, -30, 32, 6);
    ctx.strokeStyle = shade('#d97b5a', 0.2); ctx.lineWidth = 1.2;
    for (let y = -46; y < 0; y += 8) { ctx.beginPath(); ctx.moveTo(-16, y); ctx.lineTo(16, y); ctx.stroke(); }
    ctx.restore();
    const cap = new Path2D(); cap.ellipse(0, -52, 18, 14, 0, Math.PI, TAU); cap.closePath();
    sticker(ctx, cap, '#8fb8d9', { gloss: [-6, -60, 5, 3] });
    glow(ctx, 0, -68, 2.4, '#fff08a', 0.6 + 0.4 * wave(t, 0.5));
    // a Naze cob sign
    ctx.save(); ctx.translate(0, -18);
    sticker(ctx, ellipse(0, 0, 4.5, 7), '#d4c24a');
    ctx.restore();
    ctx.restore();
  },
  // Raft workshop: a hut on a bobbing log raft.
  workshop(ctx, t) {
    for (const [y, x0, x1] of [[2, -38, 38], [-3, -36, 36]]) {
      sticker(ctx, blobPath([[x0, y - 3], [x1, y - 3], [x1 + 2, y], [x1, y + 3], [x0, y + 3], [x0 - 2, y]]), '#9a6a4a', { off: [-1, -1] });
    }
    ctx.save(); ctx.translate(0, -6);
    // chimney smoke puffs
    for (let k = 0; k < 3; k++) {
      const u = (t * 0.35 + k / 3) % 1;
      ctx.fillStyle = `rgba(230,225,245,${0.55 * (1 - u)})`;
      ctx.beginPath(); ctx.arc(14 + u * 10, -44 - u * 30, 3 + u * 6, 0, TAU); ctx.fill();
    }
    sticker(ctx, blobPath([[10, -30], [10, -46], [18, -46], [18, -30]]), '#8a7f99', { off: [-1, -1] });
    const hut = blobPath([[-26, 0], [-26, -24], [26, -24], [26, 0]]);
    sticker(ctx, hut, '#b98a5a', { gloss: [-16, -18, 5, 2] });
    const roof = blobPath([[-32, -22], [0, -44], [32, -22]]);
    sticker(ctx, roof, '#6b8f7a', { off: [-2, -2] });
    // spinning gear sign
    ctx.save(); ctx.translate(-10, -12); ctx.rotate(t * 1.2);
    const g = new Path2D();
    for (let k = 0; k < 8; k++) {
      const a = k / 8 * TAU;
      g.moveTo(Math.cos(a) * 5, Math.sin(a) * 5); g.lineTo(Math.cos(a) * 8.5, Math.sin(a) * 8.5);
    }
    ribbon(ctx, g, '#e8c75a', 3);
    sticker(ctx, circle(0, 0, 5.5), '#e8c75a');
    flat(ctx, circle(0, 0, 2), '#6b5a3a', false);
    ctx.restore();
    const door = blobPath([[6, 0], [6, -14], [18, -14], [18, 0]]);
    flat(ctx, door, '#5b3f2a');
    ctx.restore();
  },
  // Beacon spire: a lattice mast from the seabed, the tower above the waves.
  spire(ctx, t, lift) {
    groundShadow(ctx, 0, 0, 14, 3.5, 0.35);
    const mast = new Path2D();
    for (const x of [-7, 7]) { mast.moveTo(x, 0); mast.lineTo(x * 0.7, -lift); }
    for (let y = 10; y < lift; y += 14) { mast.moveTo(-7, -y + 7); mast.lineTo(7, -y); }
    ribbon(ctx, mast, '#9aa3bc', 2.6);
    sticker(ctx, ellipse(0, 0, 14, 4), '#8a93a8', { off: [-1, -1] });
    sticker(ctx, ellipse(0, -lift + 1, 16, 4.5), '#ff9a6a', { off: [-1, -1] });   // float collar
    ctx.save(); ctx.translate(0, -lift); ctx.scale(0.8, 0.8);
    const tower = blobPath([[-10, 0], [-6, -50], [-3, -86], [3, -86], [6, -50], [10, 0]]);
    sticker(ctx, tower, '#b9c4dc', { gloss: [-4, -50, 1.5, 18], off: [-3, -1] });
    ctx.save(); ctx.clip(tower);
    ctx.fillStyle = '#7a6ad0';
    for (const y of [-20, -44, -66]) ctx.fillRect(-10, y, 20, 3);
    ctx.restore();
    const ring = ellipse(0, -60, 14, 4);
    ctx.save(); ctx.strokeStyle = INK; ctx.lineWidth = 5; ctx.stroke(ring);
    ctx.strokeStyle = '#e8c75a'; ctx.lineWidth = 2.5; ctx.stroke(ring); ctx.restore();
    const beat = Math.pow(Math.max(0, wave(t, 0.6)), 4);
    glow(ctx, 0, -92, 4.5 + beat * 2, '#ff8fd0', 0.6 + beat * 0.6);
    if (beat > 0.1) {
      ctx.strokeStyle = `rgba(255,143,208,${0.5 * beat})`; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(0, -92, 10 + (1 - beat) * 16, 0, TAU); ctx.stroke();
    }
    ctx.restore();
  },
  dome(ctx, t) {
    groundShadow(ctx, 0, 0, 62, 8, 0.3);
    const d = new Path2D(); d.ellipse(0, 0, 58, 50, 0, Math.PI, TAU); d.closePath();
    ctx.save(); ctx.clip(d);
    ctx.fillStyle = 'rgba(160,230,255,0.28)'; ctx.fill(d);
    // a dry garden inside the dome — an air pocket under the sea
    ctx.fillStyle = 'rgba(255,240,200,0.25)'; ctx.fill(d);
    const tree = SPRITES.mmmapple;
    for (const [x, sc] of [[-26, 0.42], [20, 0.5], [-2, 0.36]]) {
      ctx.save(); ctx.translate(x, 0); ctx.scale(sc, sc); ctx.translate(-50, -86);
      tree.draw(ctx, { t: (t * 0.3 + x) % 1, anim: 'sway', stage: 'adult', variant: 2, color: '#2f7d4a' });
      ctx.restore();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1.2;
    for (const a of [-0.55, 0, 0.55]) {
      ctx.beginPath(); ctx.ellipse(0, 0, 58 * Math.cos(a) + 0.01, 50, 0, Math.PI, TAU); ctx.stroke();
    }
    ctx.beginPath(); ctx.ellipse(0, -25, 50, 8, 0, 0, TAU); ctx.stroke();
    ctx.restore();
    outline(ctx, d);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath(); ctx.ellipse(-26, -34, 10, 4, -0.6, 0, TAU); ctx.fill();
    const base = blobPath([[-62, 2], [-60, -4], [60, -4], [62, 2]]);
    sticker(ctx, base, '#9aa3bc', { off: [-1, -1] });
    risingBubbles(ctx, t, 30, -50, 4);
  },
};

// A little column of bubbles drifting up from (x,y).
function risingBubbles(ctx, t, x, y, n) {
  ctx.save();
  ctx.strokeStyle = 'rgba(225,250,255,0.8)'; ctx.fillStyle = 'rgba(210,245,255,0.18)'; ctx.lineWidth = 1.3;
  for (let k = 0; k < n; k++) {
    const u = (t * 0.4 + k / n) % 1;
    const bx = x + Math.sin((u * 3 + k) * TAU) * 3, by = y - u * 60, r = 1.5 + k % 2 + u * 1.5;
    ctx.globalAlpha = 1 - u;
    ctx.beginPath(); ctx.arc(bx, by, r, 0, TAU); ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}

// Where each building sits: x as a fraction of width, `at` 'seabed' or
// 'surface', and seabed depth d (0 back .. 1 front).
const PLACE = {
  dome: { x: 0.62, at: 'seabed', d: 0.1 },
  hatchery: { x: 0.2, at: 'seabed', d: 0.55 },
  spire: { x: 0.9, at: 'seabed', d: 0.3 },
  granary: { x: 0.76, at: 'seabed', d: 0.7 },
  workshop: { x: 0.36, at: 'surface' },
  pod: { x: 0.55, at: 'surface' },
};

// ---- Scene -----------------------------------------------------------------
// A coastal lagoon town seen as a cutaway at the waterline: dusk sky and a
// sandy islet above, the colony's floating buildings and dock on the surface,
// and domes, stilts, kelp, coral, fish and helmeted swimmers below.
export function drawColonyScene(ctx, w, h, pop, time) {
  const s = h / 220;
  const W0 = h * 0.4;                                    // mean waterline
  const surf = (x) => W0 + Math.sin(x * 0.045 / s + time * 1.6) * 1.6 * s + Math.sin(x * 0.11 / s - time * 2.3) * 0.7 * s;
  const seabedY = (d) => h * 0.83 + d * h * 0.13;
  ctx.save();
  ctx.__detail = 1;

  // sky
  const sky = ctx.createLinearGradient(0, 0, 0, W0);
  sky.addColorStop(0, '#191338'); sky.addColorStop(0.6, '#5a3474'); sky.addColorStop(1, '#f0a07c');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, w, W0 + 2);
  const r = rng(99);
  for (let k = 0; k < 34; k++) {
    const x = r() * w, y = r() * W0 * 0.7, tw = 0.4 + 0.6 * Math.abs(wave(time * 0.3, 1, r()));
    ctx.fillStyle = `rgba(255,250,230,${0.8 * tw})`;
    ctx.fillRect(x, y, 1.4, 1.4);
  }
  const px = w * 0.2, py = h * 0.14, pr = 17 * s;           // ringed planet
  ctx.save();
  ctx.translate(px, py); ctx.rotate(-0.35);
  ctx.strokeStyle = 'rgba(255,214,170,0.55)'; ctx.lineWidth = 3 * s;
  ctx.beginPath(); ctx.ellipse(0, 0, pr * 1.9, pr * 0.5, 0, Math.PI, TAU); ctx.stroke();
  const pg = ctx.createLinearGradient(-pr, -pr, pr, pr);
  pg.addColorStop(0, '#ffd1a8'); pg.addColorStop(1, '#b0608a');
  ctx.fillStyle = pg; ctx.beginPath(); ctx.arc(0, 0, pr, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(255,214,170,0.75)';
  ctx.beginPath(); ctx.ellipse(0, 0, pr * 1.9, pr * 0.5, 0, 0, Math.PI); ctx.stroke();
  ctx.restore();
  ctx.fillStyle = '#e8e4ff';
  ctx.beginPath(); ctx.arc(w * 0.7, h * 0.1, 5 * s, 0, TAU); ctx.fill();
  ctx.fillStyle = '#5a3474';
  ctx.beginPath(); ctx.arc(w * 0.7 + 2.2 * s, h * 0.1 - 1.3 * s, 4.4 * s, 0, TAU); ctx.fill();
  // distant islands on the horizon
  ctx.fillStyle = '#6b4a84';
  for (const [x, rw, rh] of [[0.62, 0.16, 10], [0.86, 0.1, 7], [0.47, 0.06, 5]]) {
    ctx.beginPath(); ctx.ellipse(w * x, W0, w * rw, rh * s, 0, Math.PI, TAU); ctx.fill();
  }

  // ---- underwater ----
  const sea = ctx.createLinearGradient(0, W0, 0, h);
  sea.addColorStop(0, '#3fb3c9'); sea.addColorStop(0.5, '#2378a6'); sea.addColorStop(1, '#164a78');
  ctx.fillStyle = sea; ctx.fillRect(0, W0 - 3 * s, w, h);
  // god rays
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let k = 0; k < 5; k++) {
    const x = w * (0.1 + k * 0.21) + Math.sin(time * 0.3 + k) * 12 * s;
    const g = ctx.createLinearGradient(0, W0, 0, h);
    g.addColorStop(0, 'rgba(180,240,255,0.16)'); g.addColorStop(1, 'rgba(180,240,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(x - 8 * s, W0); ctx.lineTo(x + 8 * s, W0);
    ctx.lineTo(x + 34 * s, h); ctx.lineTo(x - 6 * s, h); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
  // seabed: two sandy ridges
  const bed = (y0, amp, f, ph, col) => {
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += 6) ctx.lineTo(x, y0 + Math.sin(x * f / s + ph) * amp * s);
    ctx.lineTo(w, h); ctx.closePath(); ctx.fill();
  };
  bed(seabedY(0) - 4 * s, 4, 0.02, 1, '#2f6f8a');
  bed(seabedY(0.5), 3, 0.03, 3, '#c9b48a');

  const items = [];          // underwater, depth-sorted
  const surface = [];        // on or above the waterline, drawn after the water tint
  const labels = [];
  const scaleAt = (d) => s * (0.8 + 0.2 * d);

  // buildings
  let nextLocked = null;
  for (const b of BUILDINGS) {
    const pl = PLACE[b.id];
    if (!pl || !B[b.id]) continue;
    const grow = b.pop === 0 ? 1 : smooth(b.pop, b.pop + Math.max(1, b.pop * 0.08), pop);
    const locked = grow <= 0;
    if (locked && nextLocked) continue;
    if (locked) nextLocked = b;
    const bx = pl.x * w;
    const draw = () => {
      const k = pl.at === 'seabed' ? scaleAt(pl.d) : s;
      const y = pl.at === 'seabed' ? seabedY(pl.d) : surf(bx);
      const lift = (y - W0) / k;
      ctx.save(); ctx.translate(bx, y);
      if (pl.at === 'surface') ctx.rotate(Math.cos(bx * 0.045 / s + time * 1.6) * 0.04);
      const g = locked ? 1 : grow < 1 ? Math.sin(grow * Math.PI * 0.5) * (1 + 0.15 * Math.sin(grow * Math.PI)) : 1;
      ctx.scale(k * g, k * g);
      if (locked) {
        ctx.globalAlpha = 0.22 + 0.08 * wave(time, 0.8);
        ctx.__ink = '#7af5ff';
        ctx.filter = 'grayscale(1) sepia(1) hue-rotate(140deg) saturate(3) brightness(1.3)';
      }
      B[b.id](ctx, time, lift / Math.max(g, 1e-3));
      ctx.filter = 'none';
      ctx.__ink = undefined;
      ctx.restore();
    };
    const crossing = b.id === 'granary' || b.id === 'spire';
    if (pl.at === 'surface') surface.push({ y: W0 + (locked ? -1 : 0), draw });
    else items.push({ y: seabedY(pl.d), draw, crossing });
    if (locked) {
      labels.push(() => {
        const label = `${b.name} · pop ${b.pop}`;
        ctx.save();
        ctx.font = `600 ${Math.round(10 * s)}px system-ui`;
        const tw = ctx.measureText(label).width;
        const lx = Math.min(w - tw / 2 - 6, Math.max(tw / 2 + 6, bx));
        const ly = pl.at === 'seabed' ? seabedY(pl.d) + 6 * s : W0 + 10 * s;
        ctx.fillStyle = 'rgba(12,16,22,0.55)';
        ctx.fillRect(lx - tw / 2 - 4, ly, tw + 8, 14 * s);
        ctx.fillStyle = '#9ff8ff';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(label, lx, ly + 7 * s);
        ctx.restore();
      });
    }
  }

  // seabed life: kelp, coral heads, fish
  const plant = (id, fx, d, sc, color, v = 1) => items.push({ y: seabedY(d), draw: () => {
    ctx.save(); ctx.translate(fx * w, seabedY(d));
    const k = scaleAt(d) * sc;
    ctx.scale(k, k); ctx.translate(-50, -86);
    SPRITES[id].draw(ctx, { t: (time * 0.35 + fx * 3) % 1, anim: 'sway', stage: 'adult', variant: v, color });
    ctx.restore();
  } });
  for (const [fx, d, sc, v] of [[0.05, 0.3, 0.75, 1], [0.33, 0.1, 0.55, 0], [0.46, 0.8, 0.6, 2], [0.97, 0.9, 0.7, 1], [0.8, 0.05, 0.5, 0]]) {
    plant('qelp', fx, d, sc, '#2f9f7a', v);
  }
  for (const [fx, d, rr, col] of [[0.12, 0.85, 9, '#f28aa8'], [0.42, 0.95, 7, '#ffa078'], [0.55, 0.7, 6, '#c480d6'], [0.68, 0.9, 8, '#f28aa8']]) {
    items.push({ y: seabedY(d), draw: () => {
      const x = fx * w, y = seabedY(d), k = scaleAt(d);
      ctx.save(); ctx.translate(x, y); ctx.scale(k, k);
      sticker(ctx, puffs([[-rr * 0.8, -rr * 0.6, rr * 0.7], [0, -rr, rr], [rr * 0.8, -rr * 0.5, rr * 0.65]]), col, { gloss: [-2, -rr * 1.4, 2.5, 1.5], off: [-1.5, -2] });
      ctx.restore();
    } });
  }
  for (let i = 0; i < 3; i++) {
    const rr = rng(500 + i);
    const d = 0.2 + rr() * 0.5, sp = (0.03 + rr() * 0.02) * (i % 2 ? -1 : 1);
    const raw = rr() + sp * time;
    const x = w * (((raw % 1) + 1) % 1);
    const y = W0 + (seabedY(0) - W0) * (0.3 + rr() * 0.5) + Math.sin(time * 1.2 + i) * 3 * s;
    items.push({ y: y + 40 * s, draw: () => {
      ctx.save(); ctx.translate(x, y);
      const k = 26 * s / 100 * (0.9 + d * 0.3);
      ctx.scale(sp < 0 ? -k : k, k); ctx.translate(-50, -60);
      ctx.__noShadow = true;
      SPRITES.ghoti.draw(ctx, { t: (time * 1.5 + i * 0.3) % 1, anim: 'move', color: '#5fb6e6' });
      ctx.__noShadow = false;
      ctx.restore();
    } });
  }

  // Wexles: some swim below in fishbowl helmets, the rest stroll the dock/islet.
  const n = Math.min(MAX_WEXLES, Math.max(1, Math.round(pop)));
  const carries = [null, 'naze', null, 'apple', null, 'crate'];
  const dockX0 = 0.03, dockX1 = 0.62;
  for (let i = 0; i < n; i++) {
    const rr = rng(1000 + i * 17);
    const color = WEXLE_COLORS[i % WEXLE_COLORS.length];
    const swim = i % 5 === 1 || i % 5 === 3;
    const speed = (0.02 + rr() * 0.03) * (rr() < 0.5 ? -1 : 1);
    const raw = rr() + speed * time;
    const tri = Math.abs(((raw % 2) + 2) % 2 - 1);
    const dir = Math.sign(speed) * ((((raw % 2) + 2) % 2) < 1 ? 1 : -1);
    if (swim) {
      const x = w * (0.05 + 0.9 * tri);
      const y = W0 + (seabedY(0) - W0) * (0.25 + rr() * 0.6) + Math.sin(time * 1.5 + i) * 3 * s;
      const size = 26 * s;
      items.push({ y: y + 30 * s, draw: () => {
        ctx.save(); ctx.translate(x, y);
        ctx.rotate(dir * 0.25);
        ctx.scale((dir < 0 ? -1 : 1) * size / 100, size / 100); ctx.translate(-50, -60);
        drawWexle(ctx, { color, t: (time * 3 + i * 0.37) % 1, walk: true, swim: true, helmet: true, face: 1, blink: false });
        ctx.restore();
        risingBubbles(ctx, time + i * 0.7, x + dir * 6 * s, y - 12 * s, 2);
      } });
    } else {
      const x = w * (dockX0 + (dockX1 - dockX0) * tri);
      const paused = ((time / (4 + rr() * 6) + rr()) % 1) > 0.78;
      const size = 26 * s;
      surface.push({ y: W0 + 1 + i * 0.01, draw: () => {
        const y = x < w * 0.13 ? W0 - 3 * s : surf(x) - 5 * s;   // on the islet or the dock
        ctx.save(); ctx.translate(x, y);
        ctx.scale((dir < 0 ? -1 : 1) * size / 100, size / 100); ctx.translate(-50, -86);
        drawWexle(ctx, {
          color, t: (time * 2.2 + i * 0.37) % 1, walk: !paused, carry: carries[i % carries.length],
          bag: i % 4 === 2, face: 1, blink: ((time * 0.5 + i * 0.29) % 1) > 0.95,
        });
        ctx.restore();
      } });
    }
  }

  items.sort((a, b) => a.y - b.y);
  for (const it of items) it.draw();

  // Water tint over everything below the surface (stilts included).
  ctx.save();
  ctx.beginPath(); ctx.moveTo(0, h);
  for (let x = 0; x <= w; x += 4) ctx.lineTo(x, surf(x));
  ctx.lineTo(w, h); ctx.closePath();
  ctx.fillStyle = 'rgba(30,110,160,0.22)'; ctx.fill();
  ctx.restore();

  // sandy islet on the left, with a tree and some Naze
  ctx.save();
  const islet = blobPath([[-10 * s, W0 + 8 * s], [-4 * s, W0 - 10 * s], [w * 0.08, W0 - 14 * s], [w * 0.16, W0 + 2 * s], [w * 0.14, W0 + 10 * s]]);
  sticker(ctx, islet, '#e9cf92', { gloss: [w * 0.05, W0 - 9 * s, 12 * s, 3 * s], off: [-2, -3] });
  ctx.restore();
  for (const [fx, id, sc, col, dy] of [[0.035, 'mmmapple', 0.55, '#2f7d4a', -12], [0.1, 'naze', 0.35, '#d4c24a', -8]]) {
    ctx.save(); ctx.translate(fx * w, W0 + dy * s);
    ctx.scale(sc * s, sc * s); ctx.translate(-50, -86);
    SPRITES[id].draw(ctx, { t: (time * 0.35 + fx) % 1, anim: 'sway', stage: 'adult', variant: 2, color: col });
    ctx.restore();
  }

  // the dock: planks on posts, riding the swell
  ctx.save();
  const dx0 = w * 0.12, dx1 = w * dockX1;
  for (let x = dx0; x <= dx1; x += 22 * s) {
    const post = new Path2D(); post.moveTo(x, surf(x) - 3 * s); post.lineTo(x, W0 + 14 * s);
    ribbon(ctx, post, '#6b4a34', 2.6 * s);
  }
  const plank = new Path2D();
  plank.moveTo(dx0, surf(dx0) - 3 * s);
  for (let x = dx0; x <= dx1; x += 4) plank.lineTo(x, surf(x) - 3 * s);
  ribbon(ctx, plank, '#b98a5a', 3.4 * s);
  ctx.restore();

  // surface: the wave line with foam, then floating things and dock walkers
  ctx.save();
  ctx.strokeStyle = 'rgba(240,252,255,0.9)'; ctx.lineWidth = 1.6 * s; ctx.lineCap = 'round';
  ctx.beginPath();
  for (let x = 0; x <= w; x += 4) { const y = surf(x); if (x) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
  ctx.stroke();
  ctx.strokeStyle = 'rgba(240,252,255,0.35)'; ctx.lineWidth = 1;
  for (let k = 0; k < 7; k++) {                                // sparkle dashes
    const x = ((k * 97 + time * 18) % (w + 40)) - 20, y = W0 + (4 + (k % 3) * 5) * s;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 10 * s, y); ctx.stroke();
  }
  ctx.restore();
  surface.sort((a, b) => a.y - b.y);
  for (const it of surface) it.draw();
  for (const l of labels) l();
  ctx.restore();
}
