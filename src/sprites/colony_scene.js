// ===========================================================================
//  colony_scene — the illustrated Wexle town shown in the Colony tab.
//
//  Stateless: everything is a function of (population, time), so it can be
//  redrawn every frame the tab is open. Buildings rise out of the ground as the
//  population passes their unlock threshold; the next locked building shows
//  as a cyan hologram blueprint; Wexles (one per citizen, capped) wander the
//  plaza, some carrying harvest home.
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
  groundShadow(ctx, 50, 86, 16, 4.5, 0.3);

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
}

// ---- Buildings (local coords: ground-centre at 0,0, up is -y, ~px) --------
const B = {
  pod(ctx, t) {
    groundShadow(ctx, 0, 0, 34, 6, 0.35);
    for (const x of [-22, 22, 0]) {                         // landing legs
      const l = new Path2D(); l.moveTo(x * 0.6, -16); l.lineTo(x, 0);
      ribbon(ctx, l, '#8a93a8', 3);
    }
    const hull = ellipse(0, -20, 34, 11);
    sticker(ctx, hull, '#c8d0e0', { gloss: [-12, -25, 10, 3] });
    const dome = new Path2D(); dome.ellipse(0, -26, 18, 16, 0, Math.PI, TAU); dome.closePath();
    ctx.fillStyle = 'rgba(150,230,255,0.55)'; ctx.fill(dome); outline(ctx, dome);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath(); ctx.ellipse(-7, -34, 4, 2.5, -0.5, 0, TAU); ctx.fill();
    for (let k = 0; k < 5; k++) {                           // chasing hull lights
      const on = ((t * 3) | 0) % 5 === k;
      glow(ctx, -24 + k * 12, -18, 2, on ? '#fff08a' : '#7ad0ff', on ? 1 : 0.4);
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
  },
  granary(ctx, t) {
    groundShadow(ctx, 0, 0, 20, 4.5, 0.35);
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
  },
  workshop(ctx, t) {
    groundShadow(ctx, 0, 0, 30, 5, 0.35);
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
  },
  spire(ctx, t) {
    groundShadow(ctx, 0, 0, 14, 3.5, 0.35);
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
  },
  dome(ctx, t) {
    groundShadow(ctx, 0, 0, 62, 8, 0.3);
    const d = new Path2D(); d.ellipse(0, 0, 58, 50, 0, Math.PI, TAU); d.closePath();
    ctx.save(); ctx.clip(d);
    ctx.fillStyle = 'rgba(160,230,255,0.28)'; ctx.fill(d);
    // a little garden inside the dome
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
  },
};

// Where each building sits: x as a fraction of width, depth (0 back .. 1 front),
// and scale. Back-to-front draw order comes from depth.
const PLACE = {
  dome: { x: 0.56, d: 0.0, s: 1.0 },
  spire: { x: 0.9, d: 0.15, s: 1.0 },
  granary: { x: 0.75, d: 0.35, s: 1.0 },
  hatchery: { x: 0.3, d: 0.3, s: 1.0 },
  workshop: { x: 0.12, d: 0.55, s: 1.0 },
  pod: { x: 0.52, d: 0.6, s: 1.0 },
};

// ---- Scene -----------------------------------------------------------------
export function drawColonyScene(ctx, w, h, pop, time) {
  const s = h / 220;
  const horizon = h * 0.52;
  ctx.save();
  ctx.__detail = 1;

  // sky
  const sky = ctx.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, '#191338'); sky.addColorStop(0.55, '#5a3474'); sky.addColorStop(1, '#f0a07c');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, w, horizon + 2);
  const r = rng(99);
  for (let k = 0; k < 40; k++) {
    const x = r() * w, y = r() * horizon * 0.7, tw = 0.4 + 0.6 * Math.abs(wave(time * 0.3, 1, r()));
    ctx.fillStyle = `rgba(255,250,230,${0.8 * tw})`;
    ctx.fillRect(x, y, 1.4, 1.4);
  }
  // ringed planet + small moon
  const px = w * 0.2, py = h * 0.17, pr = 20 * s;
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
  ctx.beginPath(); ctx.arc(w * 0.68, h * 0.12, 6 * s, 0, TAU); ctx.fill();
  ctx.fillStyle = '#5a3474';
  ctx.beginPath(); ctx.arc(w * 0.68 + 2.5 * s, h * 0.12 - 1.5 * s, 5.2 * s, 0, TAU); ctx.fill();

  // distant mesas and hills
  const ridge = (base, amp, freq, seed, col) => {
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += 6) {
      const y = base - amp * (0.6 * Math.sin(x * freq + seed) + 0.4 * Math.sin(x * freq * 2.3 + seed * 2));
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, h); ctx.closePath(); ctx.fill();
  };
  ridge(horizon - 6 * s, 14 * s, 0.018 / s, 1, '#6b4a84');
  ridge(horizon + 2 * s, 9 * s, 0.03 / s, 4, '#3f6b6a');

  // ground
  const gg = ctx.createLinearGradient(0, horizon, 0, h);
  gg.addColorStop(0, '#5b9a62'); gg.addColorStop(1, '#3d6e48');
  ctx.fillStyle = gg; ctx.fillRect(0, horizon + 4 * s, w, h);
  // dirt plaza
  ctx.fillStyle = '#9c7a52';
  ctx.beginPath(); ctx.ellipse(w * 0.5, h * 0.8, w * 0.46, h * 0.13, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#b08b5f';
  ctx.beginPath(); ctx.ellipse(w * 0.5, h * 0.79, w * 0.4, h * 0.09, 0, 0, TAU); ctx.fill();

  const groundY = (d) => horizon + 16 * s + d * (h - horizon - 36 * s);

  // Collect drawables (buildings, blueprint, props, Wexles) and depth-sort.
  const items = [];
  const labels = [];
  let nextLocked = null;
  for (const b of BUILDINGS) {
    const pl = PLACE[b.id];
    if (!pl || !B[b.id]) continue;
    const grow = b.pop === 0 ? 1 : smooth(b.pop, b.pop + Math.max(1, b.pop * 0.08), pop);
    if (grow <= 0) { if (!nextLocked) nextLocked = b; continue; }
    const y = groundY(pl.d);
    items.push({ y, draw: () => {
      ctx.save(); ctx.translate(pl.x * w, y);
      const k = s * pl.s * (0.8 + 0.2 * pl.d);
      // rise-up + a little overshoot bounce as it unlocks
      const pop2 = grow < 1 ? Math.sin(grow * Math.PI * 0.5) * (1 + 0.15 * Math.sin(grow * Math.PI)) : 1;
      ctx.scale(k * pop2, k * pop2);
      B[b.id](ctx, time);
      ctx.restore();
    } });
  }
  if (nextLocked) {                     // hologram blueprint of the next unlock
    const pl = PLACE[nextLocked.id];
    const y = groundY(pl.d);
    items.push({ y: y - 0.01, draw: () => {
      ctx.save(); ctx.translate(pl.x * w, y);
      const k = s * pl.s * (0.8 + 0.2 * pl.d);
      ctx.scale(k, k);
      ctx.globalAlpha = 0.22 + 0.08 * wave(time, 0.8);
      ctx.__ink = '#7af5ff';
      ctx.filter = 'grayscale(1) sepia(1) hue-rotate(140deg) saturate(3) brightness(1.3)';
      B[nextLocked.id](ctx, time);
      ctx.filter = 'none';
      ctx.__ink = undefined;
      ctx.restore();
    } });
    // label in screen space, kept inside the frame, drawn over everything
    labels.push(() => {
      const label = `${nextLocked.name} · pop ${nextLocked.pop}`;
      ctx.save();
      ctx.font = `600 ${Math.round(10 * s)}px system-ui`;
      const tw = ctx.measureText(label).width;
      const lx = Math.min(w - tw / 2 - 6, Math.max(tw / 2 + 6, pl.x * w));
      ctx.fillStyle = 'rgba(12,16,22,0.55)';
      ctx.fillRect(lx - tw / 2 - 4, y + 4 * s, tw + 8, 14 * s);
      ctx.fillStyle = '#9ff8ff';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(label, lx, y + 11 * s);
      ctx.restore();
    });
  }
  // a few Naze and trees framing the town
  const deco = [[0.03, 0.2, 'mmmapple', 0.7], [0.97, 0.7, 'naze', 0.5], [0.4, 0.05, 'naze', 0.4], [0.66, 0.9, 'cacta', 0.4], [0.24, 0.85, 'naze', 0.5]];
  for (const [fx, d, id, sc] of deco) {
    const y = groundY(d);
    items.push({ y, draw: () => {
      ctx.save(); ctx.translate(fx * w, y);
      const k = s * sc * (0.8 + 0.2 * d);
      ctx.scale(k, k); ctx.translate(-50, -86);
      SPRITES[id].draw(ctx, { t: (time * 0.35 + fx) % 1, anim: 'sway', stage: 'adult', variant: 1,
        color: { mmmapple: '#2f7d4a', naze: '#d4c24a', cacta: '#57a06a' }[id] });
      ctx.restore();
    } });
  }

  // Wexles
  const n = Math.min(MAX_WEXLES, Math.max(1, Math.round(pop)));
  const carries = [null, 'naze', null, 'apple', null, 'crate'];
  for (let i = 0; i < n; i++) {
    const rr = rng(1000 + i * 17);
    const d = 0.35 + rr() * 0.65;
    const speed = (0.025 + rr() * 0.035) * (rr() < 0.5 ? -1 : 1);
    const x0 = rr();
    const idleEvery = 4 + rr() * 6;
    // ping-pong walk across the plaza with little pauses
    const cyc = time / idleEvery + rr();
    const paused = (cyc % 1) > 0.78;
    const raw = x0 + speed * time;
    const tri = Math.abs(((raw % 2) + 2) % 2 - 1);            // 0..1 ping-pong
    const dir = Math.sign(speed) * ((((raw % 2) + 2) % 2) < 1 ? 1 : -1);
    const x = w * (0.06 + 0.88 * tri);
    const y = groundY(d);
    const size = 30 * s * (0.75 + 0.3 * d);
    const color = WEXLE_COLORS[i % WEXLE_COLORS.length];
    const carry = carries[i % carries.length];
    items.push({ y, draw: () => {
      ctx.save(); ctx.translate(x, y);
      ctx.scale((dir < 0 ? -1 : 1) * size / 100, size / 100);
      ctx.translate(-50, -86);
      drawWexle(ctx, {
        color, t: (time * 2.2 + i * 0.37) % 1, walk: !paused, carry, bag: i % 4 === 2,
        face: 1, blink: ((time * 0.5 + i * 0.29) % 1) > 0.95,
      });
      ctx.restore();
    } });
  }

  items.sort((a, b) => a.y - b.y);
  for (const it of items) it.draw();
  for (const l of labels) l();

  // warm horizon haze
  const haze = ctx.createLinearGradient(0, horizon - 10 * s, 0, horizon + 30 * s);
  haze.addColorStop(0, 'rgba(240,160,124,0)');
  haze.addColorStop(0.5, 'rgba(240,160,124,0.12)');
  haze.addColorStop(1, 'rgba(240,160,124,0)');
  ctx.fillStyle = haze; ctx.fillRect(0, horizon - 10 * s, w, 40 * s);
  ctx.restore();
}
