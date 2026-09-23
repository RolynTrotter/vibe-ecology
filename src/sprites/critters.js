// ===========================================================================
//  critters — the sprite set: one entry per species id, plus generic fallbacks
//  for species created in the dev tools.
//
//  Every draw function paints into a 100×100 box (y down) with the ground
//  contact point at ANCHOR (50,86), facing right. The atlas bakes each pose at
//  several resolutions and mirrors it for left-facing. Parameters `p`:
//    t      animation phase in [0,1)
//    anim   animals: 'move' | 'idle' | 'dead';   plants: always 'sway'
//    baby   juvenile proportions (bigger eyes, stubbier features)
//    color  body colour (the species' map colour, pre-tinted for babies/dead)
//    dead   true on the carcass pose (X eyes, no glows)
//    stage  plants: 'adult' | 'sprout';   variant  plants: 0..variants-1
//
//  Sprite metadata:
//    box        sprite box width in world units per unit of species `size`
//    move/idle  frame counts;  stride  world units travelled per move cycle
//    aerial     flies: renderer lifts it off its shadow (`altitude` × box)
//    flat       ground decal: drawn beneath everything, never y-sorted
//    variants   plant shape variants; variantBy 'energy' picks by fullness
// ===========================================================================
import {
  INK, TAU, wave, mix, shade, tint, rng, detail,
  ellipse, circle, puffs, blobPath,
  sticker, flat, ribbon, outline, eye, blush, mouth, glow, groundShadow, bubble,
} from './paint.js';

export const ANCHOR = [0.5, 0.86];

// Helpers for poses ---------------------------------------------------------
const clamp01 = (v) => Math.max(0, Math.min(1, v));
function eyeKind(p, fallback = 'open') { return p.dead ? 'x' : fallback; }
function shadowFor(ctx, p, rx, ry, a = 0.3, col) {
  if (ctx.__noShadow) return;
  groundShadow(ctx, 50, 86, rx, ry, a, col);
}
function withTransform(ctx, fn, tx, ty, rot = 0, sx = 1, sy = 1) {
  ctx.save();
  ctx.translate(tx, ty);
  if (rot) ctx.rotate(rot);
  if (sx !== 1 || sy !== 1) ctx.scale(sx, sy);
  fn();
  ctx.restore();
}

// ===========================================================================
//  ANIMALS
// ===========================================================================

// ---- Latt: big-eared scurrier with a glowing tail-tuft and antenna -------
const latt = {
  box: 2.3, move: 8, idle: 6, stride: 1.6,
  draw(ctx, p) {
    const c = p.color, t = p.t, B = p.baby;
    let bob = 0, fA = 0, fB = 0, earT = 0, tailW = wave(t) * 3;
    if (p.anim === 'move') {
      bob = -Math.abs(wave(t)) * 4.5;
      fA = wave(t) * 6; fB = -fA;
    } else if (p.anim === 'idle') {
      bob = wave(t) * 0.8;
      earT = Math.max(0, wave(t, 1, 0.2)) * 0.18;     // ear twitch
    }
    shadowFor(ctx, p, 24, 6);

    // tail — a long curl ending in a glowing tuft
    const tail = new Path2D();
    tail.moveTo(30, 74 + bob);
    tail.bezierCurveTo(12, 80, 6, 62 + tailW, 14, 50 + tailW);
    ribbon(ctx, tail, shade(c, 0.12), 3.6);
    if (!p.dead) glow(ctx, 14, 49 + tailW, 4.2, '#ffd36e');
    else sticker(ctx, circle(14, 49 + tailW, 4.2), '#c9c2b8');

    // far feet
    sticker(ctx, ellipse(40 + fB, 84, 7.5, 4.2), shade(c, 0.35));
    sticker(ctx, ellipse(64 - fB * 0.6, 84, 6.5, 3.8), shade(c, 0.35));

    // back ear (behind the head)
    const earBack = ellipse(46, 44 + bob, B ? 9 : 11, B ? 12 : 15, -0.35 - earT);
    sticker(ctx, earBack, shade(c, 0.1));
    if (detail(ctx)) { ctx.fillStyle = '#f7a3c0'; ctx.fill(ellipse(46, 46 + bob, B ? 5 : 6.5, B ? 7 : 9.5, -0.35 - earT)); }

    // body mochi
    const body = ellipse(52, 66 + bob, 27, 20);
    sticker(ctx, body, c, { gloss: [42, 54 + bob, 7, 4] });
    // cream belly/muzzle
    ctx.save(); ctx.clip(body);
    ctx.fillStyle = tint(c, 0.55);
    ctx.beginPath(); ctx.ellipse(66, 74 + bob, 18, 11, -0.2, 0, TAU); ctx.fill();
    ctx.restore();

    // front ear
    const earFront = ellipse(64, 42 + bob, B ? 10 : 12, B ? 13 : 16, 0.28 + earT);
    sticker(ctx, earFront, c, { gloss: [60, 36 + bob, 4, 3] });
    if (detail(ctx)) { ctx.fillStyle = '#ffb0c8'; ctx.fill(ellipse(64, 44 + bob, B ? 5.5 : 7, B ? 8 : 10, 0.28 + earT)); }

    // antenna with a glow bead
    if (!B) {
      const ant = new Path2D();
      ant.moveTo(56, 50 + bob);
      ant.quadraticCurveTo(52, 36 + bob, 58 + wave(t, 1, 0.3) * 2, 28 + bob);
      ribbon(ctx, ant, shade(c, 0.2), 1.8);
      if (!p.dead) glow(ctx, 58 + wave(t, 1, 0.3) * 2, 27 + bob, 3, '#9ff0ff');
    }

    // face
    const er = B ? 6.5 : 5.4;
    eye(ctx, 62, 62 + bob, er * 0.92, eyeKind(p), [1, 0]);
    eye(ctx, 75, 61 + bob, er, eyeKind(p), [1, 0]);
    blush(ctx, 58, 70 + bob, 4);
    blush(ctx, 78, 70 + bob, 3.6);
    flat(ctx, ellipse(81, 67 + bob, 3.2, 2.6), '#ff8fb0');   // nose
    mouth(ctx, 74, 72 + bob, 6, p.dead ? 'flat' : 'w');
    if (detail(ctx)) {
      ctx.save(); ctx.strokeStyle = 'rgba(42,29,61,0.55)'; ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(83, 68 + bob); ctx.lineTo(93, 65 + bob);
      ctx.moveTo(83, 70 + bob); ctx.lineTo(93, 71 + bob);
      ctx.stroke(); ctx.restore();
    }

    // near feet
    sticker(ctx, ellipse(48 + fA, 85, 7.5, 4.2), shade(c, 0.2));
    sticker(ctx, ellipse(70 - fA * 0.6, 85, 7, 4), shade(c, 0.2));
  },
};

// ---- Unclet: fluffy space-goat with lilac spiral horns and a moustache ---
const unclet = {
  box: 2.35, move: 8, idle: 6, stride: 2.4,
  draw(ctx, p) {
    const c = p.color, t = p.t, B = p.baby;
    const wool = tint(c, 0.4), face = shade(c, 0.05), hoof = shade(c, 0.62);
    let bob = 0, sw = 0, chew = 0, earF = 0;
    if (p.anim === 'move') { bob = -Math.abs(wave(t)) * 2.5; sw = wave(t) * 5; }
    else if (p.anim === 'idle') { chew = wave(t, 2) * 1.2; earF = Math.max(0, wave(t, 1, 0.6)) * 0.4; bob = wave(t) * 0.5; }
    shadowFor(ctx, p, 30, 6.5);

    // stubby legs (far pair darker); diagonal pairs swing together
    const leg = (x, dx, col) => {
      const lp = new Path2D(); lp.moveTo(x, 72 + bob); lp.lineTo(x + dx * 0.6, 83);
      ribbon(ctx, lp, col, 7);
      flat(ctx, ellipse(x + dx * 0.6, 85, 4.6, 2.8), hoof);
    };
    leg(44, -sw, shade(c, 0.45));
    leg(66, sw, shade(c, 0.45));

    // tail puff
    sticker(ctx, circle(22, 58 + bob, 6), wool);

    // wool cloud
    const cloud = puffs([
      [34, 62 + bob, 12], [47, 55 + bob, 14], [60, 60 + bob, 12],
      [42, 70 + bob, 12], [56, 70 + bob, 12], [28, 69 + bob, 9],
    ]);
    sticker(ctx, cloud, wool, { gloss: [40, 50 + bob, 8, 4], off: [-3, -5] });
    if (detail(ctx)) {      // curly wool marks
      ctx.save(); ctx.clip(cloud);
      ctx.strokeStyle = mix(wool, c, 0.6); ctx.lineWidth = 1.6; ctx.lineCap = 'round';
      for (const [x, y] of [[36, 64], [50, 62], [44, 74], [30, 71], [58, 70]]) {
        ctx.beginPath(); ctx.arc(x, y + bob, 3.2, 0.3, 2.8); ctx.stroke();
      }
      ctx.restore();
    }

    // near legs
    leg(36, sw, shade(c, 0.25));
    leg(58, -sw, shade(c, 0.25));

    const hy = 44 + bob;
    // ram-curl horn: a shrinking spiral wrapped around the side of the head
    const horn = (cx, cy, col, s) => {
      const hp = new Path2D();
      for (let k = 0; k <= 24; k++) {
        const a = -Math.PI * 0.4 - k / 24 * Math.PI * 1.7;
        const r = (10 - k * 0.27) * s;
        const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
        if (k) hp.lineTo(x, y); else hp.moveTo(x, y);
      }
      ribbon(ctx, hp, col, 5.5 * s);
    };
    const hs = B ? 0.5 : 1;
    horn(70, hy + 4, '#9a78c9', hs * 0.9);

    // head + snout
    const head = ellipse(73, 55 + bob, 12, 11.5, 0.15);
    sticker(ctx, head, face, { gloss: [69, 49 + bob, 4, 2.5] });
    const snout = ellipse(81, 61 + bob, 8.5, 6.5, 0.2);
    sticker(ctx, snout, tint(face, 0.35));
    // floppy ear
    sticker(ctx, ellipse(63, 55 + bob, 7, 3.4, 0.7 + earF), shade(face, 0.1));
    // near horn
    horn(66, hy + 8, '#c8a6f0', hs);
    if (!B && !p.dead) glow(ctx, 62, 42 + bob, 1.6, '#e4ccff', 0.8);

    eye(ctx, 76, 53 + bob, B ? 5.4 : 4.4, eyeKind(p, p.anim === 'idle' && t > 0.8 ? 'happy' : 'open'), [1, 0]);
    blush(ctx, 72, 61 + bob, 3.4);
    flat(ctx, ellipse(88, 60 + bob, 1.6, 1.3), INK, false);

    // handlebar moustache + goatee (Unclet is an uncle)
    if (!B) {
      const mc = shade(c, 0.62);
      const m = new Path2D();
      const my = 65 + bob + chew * 0.5;
      m.moveTo(83, my - 1);
      m.bezierCurveTo(78, my + 3, 72, my + 2, 71, my - 3);
      m.moveTo(83, my - 1);
      m.bezierCurveTo(88, my + 3, 94, my + 2, 94, my - 3);
      ribbon(ctx, m, mc, 3);
      const g = blobPath([[78, 67 + bob], [84, 67 + bob], [80 + chew, 76 + bob]]);
      flat(ctx, g, mc);
    } else {
      mouth(ctx, 82, 66 + bob, 4, 'smile');
    }
  },
};

// ---- Ghoti: round angler-puff fish with a glowing lure --------------------
const ghoti = {
  box: 2.3, move: 8, idle: 6, stride: 2.2,
  draw(ctx, p) {
    const c = p.color, t = p.t, B = p.baby;
    const mv = p.anim === 'move';
    const bob = p.dead ? 0 : wave(t) * (mv ? 2 : 1.2);
    const tailA = p.dead ? 0 : wave(t, 1, 0.25) * (mv ? 0.45 : 0.18);
    shadowFor(ctx, p, 18, 3.5, 0.18, '#0b2c4d');

    // tail fin
    withTransform(ctx, () => {
      const tail = blobPath([[2, 0], [-14, -14], [-10, 0], [-14, 14]]);
      sticker(ctx, tail, shade(c, 0.12));
    }, 31, 62 + bob, tailA);
    // dorsal fin
    const df = blobPath([[40, 46 + bob], [48, 30 + bob + wave(t) * 1.5], [58, 34 + bob], [62, 46 + bob]]);
    sticker(ctx, df, mix(c, '#7f7cf0', 0.35));

    // lure (behind head so the stalk tucks in)
    const lx = 80 + wave(t, 1, 0.1) * 2, ly = (B ? 36 : 26) + bob + wave(t, 1, 0.35) * 2;
    const lure = new Path2D();
    lure.moveTo(62, 44 + bob);
    lure.quadraticCurveTo(66, ly - 6, lx, ly);
    ribbon(ctx, lure, shade(c, 0.25), 1.8);

    // body
    const body = blobPath([
      [28, 62 + bob], [36, 47 + bob], [56, 41 + bob], [74, 47 + bob],
      [82, 62 + bob], [73, 76 + bob], [53, 81 + bob], [36, 75 + bob],
    ]);
    sticker(ctx, body, c, { gloss: [48, 50 + bob, 9, 4.5] });
    ctx.save(); ctx.clip(body);
    ctx.fillStyle = tint(c, 0.6);
    ctx.beginPath(); ctx.ellipse(58, 79 + bob, 24, 10, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = shade(c, 0.18); ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(20, 62 + bob, 18, -0.7, 0.7); ctx.stroke();
    ctx.beginPath(); ctx.arc(14, 62 + bob, 30, -0.45, 0.45); ctx.stroke();
    ctx.restore();

    // pectoral fin flutter
    withTransform(ctx, () => {
      sticker(ctx, ellipse(-5, 0, 8, 4.5), tint(c, 0.2));
    }, 54, 66 + bob, 0.5 + wave(t, 2) * 0.35);

    if (!p.dead) glow(ctx, lx, ly, B ? 3.2 : 4, '#fff08a');
    else sticker(ctx, circle(lx, ly, 4), '#bdb6a8');

    eye(ctx, 66, 57 + bob, B ? 8.5 : 7.2, eyeKind(p), [1, -0.2]);
    blush(ctx, 64, 68 + bob, 4);
    mouth(ctx, 79, 67 + bob, 5, p.dead ? 'flat' : (mv ? 'o' : 'smile'));

    if (mv && !p.dead) {     // bubbles rising from the mouth
      bubble(ctx, 86 + wave(t, 1) * 1.5, 58 - t * 26, 2.6);
      bubble(ctx, 90, 40 - ((t + 0.5) % 1) * 20, 1.8);
    }
  },
};

// ---- Dinsopu: chubby hopping moon-toad with glowing freckles --------------
const dinsopu = {
  box: 2.2, move: 10, idle: 8, stride: 3.2,
  draw(ctx, p) {
    const c = p.color, t = p.t, B = p.baby;
    let y = 0, sx = 1, sy = 1, sac = 0, blink = false;
    if (p.anim === 'move') {
      if (t < 0.18) { const k = t / 0.18; sx = 1 + 0.12 * k; sy = 1 - 0.14 * k; }
      else if (t < 0.78) {
        const u = (t - 0.18) / 0.6;
        y = -Math.sin(Math.PI * u) * 18;
        sx = 0.94 + 0.06 * Math.abs(1 - 2 * u); sy = 1.08 - 0.08 * Math.abs(1 - 2 * u);
      } else { const k = (t - 0.78) / 0.22; sx = 1.1 - 0.1 * k; sy = 0.88 + 0.12 * k; }
    } else if (p.anim === 'idle') {
      sac = Math.max(0, wave(t));
      blink = t > 0.86;
    }
    if (!ctx.__noShadow) {
      const k = 1 + y / 45;
      groundShadow(ctx, 50, 86, 28 * k, 6.5 * k, 0.3 * k);
    }

    ctx.save();
    ctx.translate(50, 86 + y); ctx.scale(sx, sy); ctx.translate(-50, -86);

    // back leg (folded) + foot
    sticker(ctx, ellipse(30, 76, 12, 9, -0.3), shade(c, 0.12));
    sticker(ctx, ellipse(24, 85, 9, 3.2), shade(c, 0.25));

    // body
    const body = blobPath([[22, 76], [27, 56], [42, 46], [64, 45], [78, 56], [82, 74], [68, 86], [34, 86]]);
    sticker(ctx, body, c, { gloss: [40, 54, 8, 4] });
    ctx.save(); ctx.clip(body);
    ctx.fillStyle = tint(c, 0.62);
    ctx.beginPath(); ctx.ellipse(60, 82, 20, 9, 0, 0, TAU); ctx.fill();
    ctx.restore();

    // glowing freckles
    if (detail(ctx)) {
      const fc = p.dead ? '#b8b0c4' : '#bff6ff';
      for (const [fx, fy, fr] of [[34, 60, 3], [42, 54, 2.2], [29, 68, 2.2], [48, 60, 1.6]]) {
        if (p.dead) { ctx.fillStyle = fc; ctx.beginPath(); ctx.arc(fx, fy, fr, 0, TAU); ctx.fill(); }
        else glow(ctx, fx, fy, fr * 0.7, fc, 0.7);
      }
    }

    // throat sac
    if (sac > 0.02 && detail(ctx)) {
      const s = ellipse(70, 74, 7 + sac * 5, 5 + sac * 4);
      ctx.fillStyle = 'rgba(255,190,225,0.75)';
      ctx.fill(s); outline(ctx, s, 2);
    }

    // eye domes + eyes
    const er = B ? 8.5 : 7.4;
    sticker(ctx, circle(50, 46, 10.5), c, { gloss: [46, 41, 3, 2] });
    sticker(ctx, circle(69, 45, 11), c, { gloss: [65, 40, 3, 2] });
    eye(ctx, 51, 45, er * 0.9, eyeKind(p, blink ? 'happy' : 'open'), [1, 0]);
    eye(ctx, 70, 44, er, eyeKind(p, blink ? 'happy' : 'open'), [1, 0]);

    // big smile + blush
    if (detail(ctx)) {
      ctx.save(); ctx.strokeStyle = INK; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
      ctx.beginPath();
      if (p.dead) { ctx.moveTo(60, 64); ctx.lineTo(78, 63); }
      else { ctx.moveTo(56, 61); ctx.quadraticCurveTo(68, 70, 80, 60); }
      ctx.stroke(); ctx.restore();
    }
    blush(ctx, 52, 60, 4.4);
    blush(ctx, 80, 57, 3.6);

    // front foot
    sticker(ctx, ellipse(64, 86, 8, 3.4), shade(c, 0.2));
    ctx.restore();
  },
};

// ---- Eagul: cream sky-bird with a teal-tipped plume crest -----------------
const eagul = {
  box: 2.5, move: 8, idle: 8, stride: 3.5, aerial: true, altitude: 0.42,
  draw(ctx, p) {
    const c = p.color, t = p.t, B = p.baby;
    const flap = p.dead ? -0.3 : p.anim === 'move' ? wave(t) : 0.35 + wave(t) * 0.12;
    const bob = p.dead ? 0 : -flap * 2.5;
    const tip = '#56d6c4';

    const wing = (px, py, a, col, s) => withTransform(ctx, () => {
      const w = blobPath([[0, 0], [-10, -8], [-28, -13], [-40, -8], [-34, 0], [-18, 6]]);
      sticker(ctx, w, col, { off: [-2, -3] });
      if (detail(ctx)) {
        ctx.save(); ctx.clip(w);
        ctx.fillStyle = tip;
        ctx.beginPath(); ctx.ellipse(-38, -6, 10, 12, 0, 0, TAU); ctx.fill();
        ctx.restore();
      }
    }, px, py, a, s, s);

    // far wing
    wing(48, 52 + bob, -0.35 - flap * 0.9, shade(c, 0.22), B ? 0.7 : 0.9);

    // tail fan
    for (const [a, l] of [[-0.35, 16], [0, 18], [0.35, 15]]) {
      withTransform(ctx, () => sticker(ctx, ellipse(-l / 2, 0, l / 2, 3.6), shade(c, 0.08)), 34, 60 + bob, Math.PI + a * 0.8 - 0.1);
    }

    // body
    const body = ellipse(50, 58 + bob, 21, 16);
    sticker(ctx, body, c, { gloss: [44, 50 + bob, 7, 3.5] });
    ctx.save(); ctx.clip(body);
    ctx.fillStyle = tint(c, 0.6);
    ctx.beginPath(); ctx.ellipse(58, 68 + bob, 14, 8, 0, 0, TAU); ctx.fill();
    ctx.restore();
    // tucked feet
    flat(ctx, ellipse(48, 74 + bob, 3, 2.2), '#f2a24a');
    flat(ctx, ellipse(56, 74 + bob, 3, 2.2), '#f2a24a');

    // crest plumes
    const hx = 67, hy = 46 + bob;
    if (!B) {
      for (const [dx, h, ph] of [[-4, 16, 0], [0, 20, 0.15], [4, 15, 0.3]]) {
        const sway = p.dead ? 0 : wave(t, 1, ph) * 2;
        const pl = new Path2D();
        pl.moveTo(hx + dx * 0.5, hy - 8);
        pl.quadraticCurveTo(hx + dx - 4, hy - h * 0.6, hx + dx - 6 + sway, hy - h);
        ribbon(ctx, pl, shade(c, 0.1), 2);
        if (!p.dead) glow(ctx, hx + dx - 6 + sway, hy - h, 2.2, tip, 0.6);
      }
    }
    // head
    sticker(ctx, circle(hx, hy, B ? 13 : 12), c, { gloss: [hx - 4, hy - 5, 3.5, 2.2] });
    // beak
    const beak = blobPath([[hx + 8, hy - 2], [hx + 21, hy + 3], [hx + 8, hy + 7]]);
    sticker(ctx, beak, '#f5a142', { off: [-1.5, -2] });
    eye(ctx, hx + 3, hy - 1, B ? 5.8 : 4.8, eyeKind(p), [1, 0]);
    blush(ctx, hx - 1, hy + 6, 3.2);

    // near wing
    wing(52, 56 + bob, -0.1 - flap * 1.1, c, B ? 0.8 : 1);
  },
};

// ---- Qraken: plump deep-sea squid with glowing spots ----------------------
const qraken = {
  box: 1.9, move: 10, idle: 8, stride: 3.0,
  draw(ctx, p) {
    const c = p.color, t = p.t, B = p.baby;
    const mv = p.anim === 'move';
    const pulse = p.dead ? 0 : wave(t) * (mv ? 1 : 0.4);
    const sx = 1 - pulse * 0.06, sy = 1 + pulse * 0.08;
    const lift = p.dead ? 0 : -pulse * 3;
    shadowFor(ctx, p, 26, 4.5, 0.2, '#0b2c4d');

    const tent = (bx, len, ph, col, w) => {
      const sway = p.dead ? 0.5 : wave(t, 1, ph);
      const tp = new Path2D();
      const y0 = 60 + lift;
      tp.moveTo(bx, y0);
      tp.bezierCurveTo(bx + sway * 6, y0 + len * 0.35, bx - sway * 8, y0 + len * 0.7, bx + sway * 5, y0 + len);
      tp.quadraticCurveTo(bx + sway * 5 + 6, y0 + len + 2, bx + sway * 5 + 4, y0 + len - 5);
      ribbon(ctx, tp, col, w);
    };
    // back tentacles
    for (const [bx, ph] of [[36, 0.1], [50, 0.4], [64, 0.7]]) tent(bx, 22, ph, shade(c, 0.28), 5);

    ctx.save();
    ctx.translate(50, 60 + lift); ctx.scale(sx, sy); ctx.translate(-50, -60);
    // fins
    sticker(ctx, ellipse(33, 28, 11, 6, -0.7), shade(c, 0.1));
    sticker(ctx, ellipse(67, 28, 11, 6, 0.7), shade(c, 0.1));
    // mantle
    const mantle = blobPath([[25, 60], [27, 38], [38, 21], [50, 14], [62, 21], [73, 38], [75, 60], [50, 67]]);
    sticker(ctx, mantle, c, { gloss: [40, 28, 7, 4], off: [-4, -5] });
    ctx.save(); ctx.clip(mantle);
    ctx.fillStyle = tint(c, 0.25);
    ctx.beginPath(); ctx.ellipse(50, 66, 26, 10, 0, 0, TAU); ctx.fill();
    ctx.restore();
    // glowing spots
    if (detail(ctx)) {
      for (const [x, y, r] of [[38, 30, 2.4], [50, 24, 2.8], [62, 30, 2.4], [44, 38, 1.6], [58, 37, 1.6]]) {
        if (p.dead) { ctx.fillStyle = '#c8c0d0'; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
        else glow(ctx, x, y, r * 0.8, '#8ff5ff', 0.55 + 0.3 * wave(t, 1, x / 50));
      }
    }
    const er = B ? 10.5 : 8.8;
    // pale eye patches so the dark eyes read against the purple mantle
    for (const ex of [40, 61]) flat(ctx, ellipse(ex, 49, er * 1.05, er * 1.2), tint(c, 0.7), false);
    eye(ctx, 40, 49, er, eyeKind(p), [1, 0.2]);
    eye(ctx, 61, 49, er, eyeKind(p), [1, 0.2]);
    blush(ctx, 33, 58, 4.4);
    blush(ctx, 68, 58, 4.4);
    mouth(ctx, 51, 59, 6, p.dead ? 'flat' : 'w');
    ctx.restore();

    // front tentacles
    for (const [bx, ph] of [[30, 0.25], [43, 0.55], [57, 0.85], [70, 0.05]]) tent(bx, 24, ph, c, 6);
  },
};

// ---- Necrow: tiny black scavenger bird with glowing cyan eyes -------------
const necrow = {
  box: 2.5, move: 8, idle: 8, stride: 3.5, aerial: true, altitude: 0.38, idleGrounded: true,
  draw(ctx, p) {
    const t = p.t, B = p.baby;
    const c = p.color;
    const body = mix(c, '#3a3350', 0.25), dark = shade(c, 0.3);
    const eyeC = p.dead ? '#8a8699' : '#6ff3ff';
    ctx.save();
    ctx.__ink = '#7a6aa6';                       // lighter rim so black reads
    const grounded = p.anim === 'idle' || p.dead;
    const flap = grounded ? -0.9 : wave(t);
    const bob = grounded ? 0 : -flap * 2;
    const peck = p.anim === 'idle' ? Math.max(0, Math.sin(TAU * t)) : 0;

    const wing = (px, py, a, col, s) => withTransform(ctx, () => {
      const w = blobPath([[0, 0], [-10, -8], [-24, -12], [-34, -9], [-28, -4], [-34, -1], [-24, 2], [-28, 5], [-14, 6]]);
      sticker(ctx, w, col, { off: [-2, -3] });
    }, px, py, a, s, s);

    if (grounded) {           // spindly legs
      const lg = new Path2D();
      lg.moveTo(46, 66); lg.lineTo(44, 85); lg.moveTo(54, 66); lg.lineTo(56, 85);
      ribbon(ctx, lg, '#b9b2c7', 1.8);
    }
    if (!grounded) wing(48, 52 + bob, -0.3 - flap * 0.9, dark, B ? 0.7 : 0.85);

    // tail
    for (const a of [-0.25, 0.2]) withTransform(ctx, () => sticker(ctx, ellipse(-8, 0, 9, 3), dark), 36, 62 + bob, Math.PI + a);
    // body
    const bdy = ellipse(50, 60 + bob, 17, 14);
    sticker(ctx, bdy, body, { gloss: [44, 53 + bob, 6, 3], dark: shade(body, 0.4) });

    // head (dips on the peck)
    const hx = 64 + peck * 5, hy = 48 + bob + peck * 16;
    // tuft
    if (!B) {
      const tf = new Path2D();
      tf.moveTo(hx - 3, hy - 9); tf.lineTo(hx - 8, hy - 18);
      tf.moveTo(hx, hy - 10); tf.lineTo(hx - 1, hy - 20);
      tf.moveTo(hx + 3, hy - 9); tf.lineTo(hx + 6, hy - 16);
      ribbon(ctx, tf, dark, 2.2);
    }
    sticker(ctx, circle(hx, hy, B ? 12 : 10.5), body, { gloss: [hx - 3, hy - 4, 3, 2], dark: shade(body, 0.4) });
    const beak = blobPath([[hx + 6, hy - 3], [hx + 20, hy + 4], [hx + 6, hy + 5]]);
    sticker(ctx, beak, '#d9d2bd', { off: [-1.5, -2] });
    // glowing eye (two tiny ones — the far eye peeks over the brow)
    if (p.dead) eye(ctx, hx + 3, hy - 1, 3.8, 'x');
    else {
      glow(ctx, hx - 2, hy - 2, B ? 2.6 : 2, eyeC, 0.6);
      glow(ctx, hx + 4, hy - 1, B ? 3.8 : 3.2, eyeC, 0.9);
      if (detail(ctx)) { ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(hx + 5, hy - 0.5, 1.3, 0, TAU); ctx.fill(); }
    }
    if (!grounded) wing(52, 56 + bob, -0.05 - flap * 1.1, body, B ? 0.75 : 0.95);
    else sticker(ctx, ellipse(46, 60, 12, 7, 0.25), dark, { off: [-2, -2] });  // folded wing
    ctx.__ink = undefined;               // a plain property, so save/restore won't reset it
    ctx.restore();
  },
};

// ===========================================================================
//  PLANTS
// ===========================================================================

// ---- Qelp: swaying kelp ribbons tipped with glowing float-bulbs ------------
const qelp = {
  box: 2.9, frames: 8, variants: 3,
  draw(ctx, p) {
    const c = p.color, t = p.t, sprout = p.stage === 'sprout';
    const r = rng(11 + p.variant * 7);
    shadowFor(ctx, p, 14, 3, 0.2, '#0b2c4d');
    const n = sprout ? 2 : [3, 4, 3][p.variant];
    const cols = [c, shade(c, 0.15), tint(c, 0.15)];
    const bulbC = ['#aaffdd', '#ffe98a', '#b5c8ff'][p.variant];
    for (let k = 0; k < n; k++) {
      const bx = 50 + (k - (n - 1) / 2) * 7;
      const h = (sprout ? 22 : 44) + r() * (sprout ? 8 : 22);
      const lean = (k - (n - 1) / 2) * 6 + (r() - 0.5) * 6;
      const sw = wave(t, 1, k * 0.23) * (sprout ? 3 : 7);
      const tx = bx + lean + sw, ty = 84 - h;
      const f = new Path2D();
      f.moveTo(bx, 84);
      f.bezierCurveTo(bx - 6 + sw * 0.3, 84 - h * 0.35, bx + lean + 6 + sw * 0.7, 84 - h * 0.7, tx, ty);
      ribbon(ctx, f, cols[k % 3], sprout ? 4 : 5.5);
      // leaflets along the frond
      if (!sprout) {
        for (const q of k % 2 ? [0.5] : [0.62]) {
          const lx = bx + (lean + sw) * q + (q < 0.6 ? 2 : -2), ly = 84 - h * q;
          withTransform(ctx, () => sticker(ctx, ellipse(5, 0, 7, 2.8), tint(cols[k % 3], 0.1), { off: [-1, -1.5], lw: 2.4 }),
            lx, ly, (k % 2 ? -0.7 : 0.7) * (q < 0.6 ? 1 : -1) + sw * 0.03 - 0.4);
        }
      }
      glow(ctx, tx, ty, sprout ? 2.4 : 3.6, bulbC, 0.5 + 0.35 * wave(t, 1, k * 0.3));
    }
    // holdfast pebble
    sticker(ctx, ellipse(50, 85, 11, 4), '#5d7f86');
  },
};

// ---- Naze: alien corn — bead-kernel cob with glowing tassels ---------------
const naze = {
  box: 3.4, frames: 8, variants: 3,
  draw(ctx, p) {
    const c = p.color, t = p.t, sprout = p.stage === 'sprout';
    const leaf = '#64b04f', leafD = shade(leaf, 0.25);
    shadowFor(ctx, p, 12, 3, 0.25);
    ctx.save();
    ctx.translate(50, 86); ctx.rotate(wave(t, 1, p.variant * 0.3) * 0.07); ctx.translate(-50, -86);
    if (sprout) {
      const s = new Path2D(); s.moveTo(50, 86); s.lineTo(50, 70);
      ribbon(ctx, s, leaf, 3);
      withTransform(ctx, () => sticker(ctx, ellipse(-8, 0, 9, 4), leaf), 50, 72, 0.5);
      withTransform(ctx, () => sticker(ctx, ellipse(8, 0, 9, 4), tint(leaf, 0.15)), 50, 70, -0.5);
      glow(ctx, 50, 66, 3, tint(c, 0.3), 0.5);
      ctx.restore();
      return;
    }
    const top = [42, 34, 40][p.variant];
    const stalk = new Path2D(); stalk.moveTo(50, 86); stalk.quadraticCurveTo(48, 64, 50, top + 12);
    ribbon(ctx, stalk, leafD, 5);
    // long arching leaves
    const lf = (sx, sy, dir, len, col) => {
      const l = blobPath([[sx, sy], [sx + dir * len * 0.5, sy - 12], [sx + dir * len, sy - 4], [sx + dir * len * 0.55, sy - 5]]);
      sticker(ctx, l, col, { off: [-1.5, -2] });
    };
    lf(50, 72, -1, 26, leaf);
    lf(50, 64, 1, 24, tint(leaf, 0.12));
    if (p.variant === 2) {          // a second, smaller side cob
      withTransform(ctx, () => cob(ctx, c, 0, 0, 0.62, t), 58, 56, 0.5);
    }
    cob(ctx, c, 50, top, 1, t);
    ctx.restore();
  },
};
function cob(ctx, c, x, y, s, t) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  // tassel hairs
  for (const [dx, ph, col] of [[-3, 0, '#ffb3e6'], [0, 0.3, '#c9a6ff'], [3, 0.6, '#ffb3e6']]) {
    const sw = wave(t, 1, ph) * 2.5;
    const h = new Path2D();
    h.moveTo(dx * 0.4, -12);
    h.bezierCurveTo(dx, -20, dx * 2 + sw, -20, dx * 2.4 + sw, -26);
    ribbon(ctx, h, '#e8d9a8', 1.4);
    glow(ctx, dx * 2.4 + sw, -26, 1.8, col, 0.5);
  }
  const body = ellipse(0, 0, 9, 15);
  sticker(ctx, body, c, { gloss: [-3, -7, 2.5, 4] });
  if (detail(ctx)) {
    ctx.save(); ctx.clip(body);
    for (let row = -12; row <= 12; row += 4.2) {
      for (let col = -8; col <= 8; col += 4.2) {
        const ox = (Math.round(row / 4.2) & 1) ? 2.1 : 0;
        ctx.fillStyle = shade(c, 0.18);
        ctx.beginPath(); ctx.arc(col + ox, row + 0.6, 1.9, 0, TAU); ctx.fill();
        ctx.fillStyle = tint(c, 0.45);
        ctx.beginPath(); ctx.arc(col + ox - 0.5, row, 1.1, 0, TAU); ctx.fill();
      }
    }
    ctx.restore();
  }
  // husk wrapping the lower half
  const leaf = '#64b04f';
  sticker(ctx, blobPath([[0, 14], [-12, 4], [-9, -6], [-3, 8]]), leaf, { off: [-1, -1.5] });
  sticker(ctx, blobPath([[0, 14], [12, 4], [9, -4], [3, 8]]), shade(leaf, 0.1), { off: [-1, -1.5] });
  ctx.restore();
}

// ---- Cacta: sleepy bean cactus wearing a flower hat -----------------------
const cacta = {
  box: 2.9, frames: 6, variants: 3,
  draw(ctx, p) {
    const c = p.color, t = p.t, sprout = p.stage === 'sprout';
    const breathe = 1 + wave(t) * 0.025;
    const flower = ['#ff8fc0', '#ffd84d', '#c59bff'][p.variant];
    shadowFor(ctx, p, sprout ? 12 : 22, sprout ? 3.5 : 5.5, 0.28);
    ctx.save();
    ctx.translate(50, 86); ctx.scale(1 / Math.sqrt(breathe), breathe); ctx.translate(-50, -86);
    if (sprout) {
      const b = blobPath([[40, 86], [40, 72], [50, 64], [60, 72], [60, 86]]);
      sticker(ctx, b, c, { gloss: [46, 70, 2.5, 2] });
      eye(ctx, 46, 76, 2.4, 'sleepy');
      eye(ctx, 54, 76, 2.4, 'sleepy');
      glow(ctx, 50, 63, 2.6, flower, 0.4);
      ctx.restore();
      return;
    }
    // arms (behind the body edges)
    if (p.variant !== 1) sticker(ctx, blobPath([[34, 70], [24, 66], [22, 54], [27, 50], [31, 58], [36, 60]]), shade(c, 0.05));
    if (p.variant !== 0) sticker(ctx, blobPath([[66, 66], [76, 62], [78, 50], [73, 47], [69, 55], [64, 57]]), c);
    const body = blobPath([[31, 86], [29, 62], [35, 43], [50, 36], [65, 43], [71, 62], [69, 86]]);
    sticker(ctx, body, c, { gloss: [40, 48, 4, 7] });
    if (detail(ctx)) {
      ctx.save(); ctx.clip(body);
      ctx.strokeStyle = shade(c, 0.22); ctx.lineWidth = 2; ctx.lineCap = 'round';
      for (const x of [40, 50, 60]) {
        ctx.beginPath(); ctx.moveTo(x, 40); ctx.quadraticCurveTo(x + (x - 50) * 0.3, 64, x, 88); ctx.stroke();
      }
      // spine ticks
      ctx.strokeStyle = '#fff7d6'; ctx.lineWidth = 1.3;
      for (const [x, y] of [[36, 52], [45, 46], [56, 47], [64, 54], [34, 72], [66, 74], [42, 80], [60, 82]]) {
        ctx.beginPath(); ctx.moveTo(x - 2, y - 2); ctx.lineTo(x + 2, y + 2);
        ctx.moveTo(x + 2, y - 2); ctx.lineTo(x - 2, y + 2); ctx.stroke();
      }
      ctx.restore();
    }
    // sleepy face
    eye(ctx, 43, 63, 4, 'sleepy');
    eye(ctx, 57, 63, 4, 'sleepy');
    blush(ctx, 39, 69, 3.6);
    blush(ctx, 61, 69, 3.6);
    mouth(ctx, 50, 69, 4, 'smile');
    // flower hat
    const fx = 50, fy = 36;
    for (let k = 0; k < 5; k++) {
      const a = k / 5 * TAU - Math.PI / 2 + wave(t) * 0.05;
      sticker(ctx, ellipse(fx + Math.cos(a) * 5.5, fy + Math.sin(a) * 4.2, 4.6, 3.6, a), flower, { off: [-1, -1.5] });
    }
    glow(ctx, fx, fy, 2.6, '#fff3a8', 0.6);
    ctx.restore();
  },
};

// ---- Muss: flat lichen rosettes with tiny glowing mushrooms ----------------
const muss = {
  box: 3.6, frames: 6, variants: 3, flat: true,
  draw(ctx, p) {
    const c = p.color, t = p.t, sprout = p.stage === 'sprout';
    const r = rng(5 + p.variant * 13);
    const rosette = (x, y, rad, col) => {
      const pts = [];
      const lobes = 7;
      for (let k = 0; k < lobes * 2; k++) {
        const a = k / (lobes * 2) * TAU;
        const rr = rad * (k % 2 ? 0.72 : 1) * (0.9 + r() * 0.2);
        pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.55]);
      }
      const pth = blobPath(pts);
      sticker(ctx, pth, col, { off: [-1.5, -2] });
      if (detail(ctx)) {
        ctx.fillStyle = shade(col, 0.28);
        for (let k = 0; k < 4; k++) {
          ctx.beginPath(); ctx.arc(x + (r() - 0.5) * rad, y + (r() - 0.5) * rad * 0.5, 1.2, 0, TAU); ctx.fill();
        }
      }
    };
    const n = sprout ? 1 : 3 + p.variant;
    const spots = [[50, 76, 13], [36, 70, 10], [64, 71, 11], [42, 82, 9], [60, 83, 8], [30, 80, 7]];
    for (let k = 0; k < n; k++) {
      const [x, y, rad] = spots[k];
      rosette(x, y, rad * (sprout ? 0.7 : 1), [c, tint(c, 0.2), shade(c, 0.08)][k % 3]);
    }
    if (!sprout) {
      const m = [[44, 72, 0], [58, 76, 0.4], [66, 68, 0.7]].slice(0, 1 + p.variant);
      for (const [x, y, ph] of m) {
        const st = new Path2D(); st.moveTo(x, y); st.lineTo(x, y - 7);
        ribbon(ctx, st, '#e9e3cf', 1.8);
        const cap = blobPath([[x - 5, y - 7], [x, y - 12], [x + 5, y - 7]]);
        ctx.save();
        const a = 0.5 + 0.5 * wave(t, 1, ph);
        const g = ctx.createRadialGradient(x, y - 8, 0, x, y - 8, 12);
        g.addColorStop(0, `rgba(127,240,230,${0.45 * a})`); g.addColorStop(1, 'rgba(127,240,230,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y - 8, 12, 0, TAU); ctx.fill();
        ctx.restore();
        sticker(ctx, cap, mix('#7ff0e6', '#ffffff', 0.25 * a), { off: [-1, -1] });
      }
    }
  },
};

// ---- Mmmapple: puffy tree dotted with smiling mmmapples --------------------
// Variants are fullness levels (0..2): fruit count follows the tree's energy.
const mmmapple = {
  box: 2.9, frames: 8, variants: 3, variantBy: 'energy',
  draw(ctx, p) {
    const c = p.color, t = p.t, sprout = p.stage === 'sprout';
    const bark = '#7a5236';
    const sway = wave(t) * 1.4;
    shadowFor(ctx, p, sprout ? 12 : 30, sprout ? 3 : 7, 0.32);
    if (sprout) {
      const tr = new Path2D(); tr.moveTo(50, 86); tr.lineTo(50 + sway * 0.5, 66);
      ribbon(ctx, tr, bark, 3.5);
      sticker(ctx, puffs([[50 + sway, 60, 9], [43 + sway, 64, 6], [57 + sway, 64, 6]]), c, { gloss: [47 + sway, 55, 3, 2] });
      return;
    }
    // trunk with root flares
    const trunk = blobPath([[40, 87], [45, 80], [46, 58], [54, 58], [55, 80], [60, 87], [50, 85]]);
    sticker(ctx, trunk, bark, { off: [-2, -1] });
    if (detail(ctx)) {
      ctx.save(); ctx.strokeStyle = shade(bark, 0.3); ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(49, 64); ctx.lineTo(48, 76); ctx.moveTo(52, 68); ctx.lineTo(53, 80); ctx.stroke();
      ctx.restore();
    }
    const cx = 50 + sway;
    const crown = puffs([
      [cx, 26, 19], [cx - 18, 36, 15], [cx + 18, 36, 15],
      [cx - 12, 50, 14], [cx + 12, 50, 14], [cx, 42, 18],
    ]);
    sticker(ctx, crown, c, { gloss: [cx - 8, 20, 8, 4], off: [-4, -6] });
    if (detail(ctx)) {
      ctx.save(); ctx.clip(crown);
      ctx.strokeStyle = tint(c, 0.3); ctx.lineWidth = 1.8; ctx.lineCap = 'round';
      for (const [x, y] of [[-10, 30], [8, 24], [14, 42], [-16, 44], [0, 50]]) {
        ctx.beginPath(); ctx.arc(cx + x, y, 4.5, Math.PI * 1.1, Math.PI * 1.7); ctx.stroke();
      }
      ctx.restore();
    }
    const fruitSpots = [[-12, 36], [10, 30], [2, 48], [-20, 46], [18, 46], [-4, 22]];
    const nFruit = [0, 3, 6][p.variant];
    for (let k = 0; k < nFruit; k++) {
      const [fx, fy] = fruitSpots[k];
      mmmFruit(ctx, cx + fx, fy + wave(t, 1, k * 0.2) * 0.6);
    }
  },
};
function mmmFruit(ctx, x, y) {
  sticker(ctx, puffs([[x - 2.2, y, 4.6], [x + 2.2, y, 4.6]]), '#ff5f8f', { gloss: [x - 2, y - 2.2, 1.6, 1.1], off: [-1, -1.5], lw: 1.8 });
  if (detail(ctx)) {
    ctx.fillStyle = '#6fd66a';
    ctx.beginPath(); ctx.ellipse(x + 2.5, y - 5.5, 2.6, 1.3, -0.5, 0, TAU); ctx.fill();
    eye(ctx, x - 1.8, y + 0.2, 1.1, 'happy');
    eye(ctx, x + 1.8, y + 0.2, 1.1, 'happy');
  }
}

// ===========================================================================
//  Generic fallbacks (dev-created species)
// ===========================================================================
const genericAnimal = {
  box: 2.3, move: 8, idle: 6, stride: 2,
  draw(ctx, p) {
    const c = p.color, t = p.t, B = p.baby;
    const bob = p.anim === 'move' ? -Math.abs(wave(t)) * 4 : wave(t) * 0.8;
    const fA = p.anim === 'move' ? wave(t) * 5 : 0;
    shadowFor(ctx, p, 22, 5.5);
    sticker(ctx, ellipse(40 - fA, 84, 7, 4), shade(c, 0.3));
    const ant = new Path2D(); ant.moveTo(54, 44 + bob); ant.quadraticCurveTo(56, 30 + bob, 64, 26 + bob);
    ribbon(ctx, ant, shade(c, 0.2), 2);
    if (!p.dead) glow(ctx, 64, 26 + bob, 3.4, '#fff08a');
    const body = blobPath([[26, 82], [26, 60], [38, 44 + bob], [60, 42 + bob], [74, 58 + bob], [74, 82]]);
    sticker(ctx, body, c, { gloss: [38, 54 + bob, 6, 3.5] });
    eye(ctx, 56, 60 + bob, B ? 7 : 6, eyeKind(p), [1, 0]);
    eye(ctx, 69, 59 + bob, B ? 6.4 : 5.4, eyeKind(p), [1, 0]);
    blush(ctx, 52, 70 + bob, 3.8);
    mouth(ctx, 64, 71 + bob, 5, p.dead ? 'flat' : 'smile');
    sticker(ctx, ellipse(60 + fA, 85, 7, 4), shade(c, 0.15));
  },
};

const genericPlant = {
  box: 2.8, frames: 6, variants: 2,
  draw(ctx, p) {
    const c = p.color, t = p.t, sprout = p.stage === 'sprout';
    shadowFor(ctx, p, 14, 3.5, 0.25);
    const s = sprout ? 0.6 : 1;
    ctx.save();
    ctx.translate(50, 86); ctx.rotate(wave(t) * 0.05); ctx.scale(s, s); ctx.translate(-50, -86);
    const leaves = p.variant ? [[-0.9, 26], [-0.3, 32], [0.3, 30], [0.9, 24]] : [[-0.7, 28], [0, 34], [0.7, 28]];
    leaves.forEach(([a, l], k) => withTransform(ctx, () =>
      sticker(ctx, ellipse(0, -l / 2, 7, l / 2), k % 2 ? tint(c, 0.15) : c, { off: [-1.5, -2] }), 50, 84, a));
    glow(ctx, 50, 50, 3.4, tint(c, 0.6), 0.5);
    ctx.restore();
  },
};

// ===========================================================================
export const SPRITES = { latt, unclet, ghoti, dinsopu, eagul, qraken, necrow, qelp, naze, cacta, muss, mmmapple };
export const FALLBACK = { animal: genericAnimal, plant: genericPlant };

export function spriteFor(def) {
  return SPRITES[def.id] || FALLBACK[def.kind === 'plant' ? 'plant' : 'animal'];
}
