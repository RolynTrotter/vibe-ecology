// ===========================================================================
//  paint — the shared "kawaii sticker" drawing kit every sprite is built from.
//
//  Sprites are drawn in a 100×100 unit box (y down) and baked to bitmaps by the
//  atlas at several resolutions. A sticker part is: a flat fill, a cel-shade
//  crescent on the lower-right (the base colour is re-filled offset up-left
//  inside a clip), a soft gloss highlight, and a dark ink outline. At low
//  detail (tiny mip levels) the outline and fine features are skipped so a
//  far-away critter reads as a clean blob of its species colour.
// ===========================================================================

export const INK = '#2a1d3d';          // outline ink: a deep plum, softer than black
export const GLOW = '#fff6b0';

// ---- colour maths ---------------------------------------------------------
const rgbCache = new Map();
export function rgb(hex) {
  let c = rgbCache.get(hex);
  if (c) return c;
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map(ch => ch + ch).join('');
  const v = parseInt(h, 16);
  c = [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  rgbCache.set(hex, c);
  return c;
}
const toHex = (r, g, b) =>
  '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');

export function mix(a, b, t) {
  const A = rgb(a), B = rgb(b);
  return toHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
}
export const shade = (c, t = 0.3) => mix(c, '#2a1648', t);   // toward cool plum shadow
export const tint = (c, t = 0.35) => mix(c, '#fffbea', t);   // toward warm cream light
export function alpha(hex, a) {
  const [r, g, b] = rgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}
// Grey-violet wash for carcasses.
export const deadTint = (c) => mix(mix(c, '#8d8a99', 0.7), '#5b5570', 0.15);

// ---- context state --------------------------------------------------------
// The baker stamps `detail` (0 = tiny blob mip, 1 = full) and `ink` onto the
// context before calling a sprite's draw function; helpers read them here.
export const detail = (ctx) => ctx.__detail ?? 1;
const inkOf = (ctx) => ctx.__ink ?? INK;
const LW = 3.4; // outline width in box units

// ---- path builders (return Path2D) ---------------------------------------
export function ellipse(x, y, rx, ry, rot = 0) {
  const p = new Path2D();
  p.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  return p;
}
export function circle(x, y, r) { return ellipse(x, y, r, r); }

// Union of circles [[x,y,r],...] as one path (for fluffy clouds/canopies).
// Non-zero winding makes the overlaps solid.
export function puffs(list) {
  const p = new Path2D();
  for (const [x, y, r] of list) { p.moveTo(x + r, y); p.arc(x, y, r, 0, Math.PI * 2); }
  return p;
}

// Smooth closed blob through points [[x,y],...] (Catmull-Rom → Bézier).
export function blobPath(pts) {
  const p = new Path2D();
  const n = pts.length;
  const P = (i) => pts[(i + n) % n];
  p.moveTo(P(0)[0], P(0)[1]);
  for (let i = 0; i < n; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    p.bezierCurveTo(
      p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6,
      p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6,
      p2[0], p2[1]);
  }
  p.closePath();
  return p;
}

// ---- stickers -------------------------------------------------------------
// Fill a part with cel shading, gloss, and ink outline.
//   o.dark   shadow colour (default: shade(fill))
//   o.off    [dx,dy] of the lit re-fill (default up-left) — bigger = more shadow
//   o.gloss  false, or [x,y,rx,ry] for the highlight ellipse
//   o.line   false to skip the outline
export function sticker(ctx, path, fill, o = {}) {
  const d = detail(ctx);
  // Ink goes down first, twice as wide, so the fill covers its inner half:
  // only the outer silhouette of a union (puffs) gets outlined.
  if (o.line !== false && d) outline(ctx, path, (o.lw ?? LW) * 2);
  ctx.save();
  ctx.clip(path);
  ctx.fillStyle = o.dark ?? shade(fill, 0.32);
  ctx.fill(path);
  const [ox, oy] = o.off ?? [-3.5, -4.5];
  ctx.translate(ox, oy);
  ctx.fillStyle = fill;
  ctx.fill(path);
  ctx.translate(-ox, -oy);
  if (o.gloss && d) {
    const [gx, gy, grx, gry] = o.gloss;
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.beginPath(); ctx.ellipse(gx, gy, grx, gry, -0.5, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

export function outline(ctx, path, w = LW) {
  ctx.save();
  ctx.strokeStyle = inkOf(ctx);
  ctx.lineWidth = w;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke(path);
  ctx.restore();
}

// A flat (unshaded) filled part, outlined.
export function flat(ctx, path, fill, line = true) {
  if (line && detail(ctx)) outline(ctx, path, LW * 2);
  ctx.fillStyle = fill;
  ctx.fill(path);
}

// An outlined ribbon/limb along a path: ink stroke, then colour stroke inside.
export function ribbon(ctx, path, color, width) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (detail(ctx)) {
    ctx.strokeStyle = inkOf(ctx);
    ctx.lineWidth = width + LW * 1.4;
    ctx.stroke(path);
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke(path);
  ctx.restore();
}

// ---- faces ---------------------------------------------------------------
// Big glossy anime eye. kind: 'open' | 'happy' (^) | 'sleepy' (‿) | 'x' (dead).
export function eye(ctx, x, y, r, kind = 'open', look = [0, 0]) {
  const d = detail(ctx);
  if (!d) {                                   // far mip: just a dark dot
    if (kind === 'open') { ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(x, y, r * 0.7, 0, 7); ctx.fill(); }
    return;
  }
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = INK;
  if (kind === 'open') {
    const ex = x + look[0] * r * 0.15, ey = y + look[1] * r * 0.15;
    ctx.fillStyle = INK;
    ctx.beginPath(); ctx.ellipse(ex, ey, r * 0.82, r, 0, 0, Math.PI * 2); ctx.fill();
    // iris glow at the bottom — a sci-fi shimmer
    const g = ctx.createLinearGradient(0, ey - r, 0, ey + r);
    g.addColorStop(0.45, 'rgba(120,90,255,0)');
    g.addColorStop(1, 'rgba(140,210,255,0.75)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(ex, ey, r * 0.82, r, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(ex + r * 0.28, ey - r * 0.4, r * 0.36, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(ex - r * 0.3, ey + r * 0.38, r * 0.16, 0, Math.PI * 2); ctx.fill();
  } else if (kind === 'happy') {
    ctx.lineWidth = r * 0.45;
    ctx.beginPath(); ctx.arc(x, y + r * 0.35, r * 0.7, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
  } else if (kind === 'sleepy') {
    ctx.lineWidth = r * 0.4;
    ctx.beginPath(); ctx.arc(x, y - r * 0.2, r * 0.7, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke();
  } else if (kind === 'x') {
    ctx.lineWidth = r * 0.42;
    const k = r * 0.6;
    ctx.beginPath();
    ctx.moveTo(x - k, y - k); ctx.lineTo(x + k, y + k);
    ctx.moveTo(x + k, y - k); ctx.lineTo(x - k, y + k);
    ctx.stroke();
  }
  ctx.restore();
}

export function blush(ctx, x, y, r) {
  if (!detail(ctx)) return;
  ctx.fillStyle = 'rgba(255,120,160,0.45)';
  ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.6, 0, 0, Math.PI * 2); ctx.fill();
}

// kind: 'smile' | 'w' (cat mouth) | 'o' | 'flat'
export function mouth(ctx, x, y, w, kind = 'smile') {
  if (!detail(ctx)) return;
  ctx.save();
  ctx.strokeStyle = INK;
  ctx.fillStyle = INK;
  ctx.lineWidth = 2.4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  if (kind === 'smile') {
    ctx.arc(x, y - w * 0.35, w * 0.55, Math.PI * 0.2, Math.PI * 0.8);
    ctx.stroke();
  } else if (kind === 'w') {
    ctx.moveTo(x - w * 0.6, y - w * 0.1);
    ctx.quadraticCurveTo(x - w * 0.3, y + w * 0.45, x, y);
    ctx.quadraticCurveTo(x + w * 0.3, y + w * 0.45, x + w * 0.6, y - w * 0.1);
    ctx.stroke();
  } else if (kind === 'o') {
    ctx.ellipse(x, y, w * 0.28, w * 0.34, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.moveTo(x - w * 0.4, y); ctx.lineTo(x + w * 0.4, y);
    ctx.stroke();
  }
  ctx.restore();
}

// ---- effects ---------------------------------------------------------------
// Soft bioluminescent glow: a halo plus a bright core.
export function glow(ctx, x, y, r, color = GLOW, strength = 1) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.6);
  g.addColorStop(0, alpha(color, 0.55 * strength));
  g.addColorStop(1, alpha(color, 0));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r * 2.6, 0, Math.PI * 2); ctx.fill();
  const c = circle(x, y, r);
  ctx.fillStyle = color;
  ctx.fill(c);
  if (detail(ctx)) {
    if (r >= 3.5) outline(ctx, c, 2.2);   // tiny glows stay soft (freckles, spots)
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.35, 0, Math.PI * 2); ctx.fill();
  }
}

// Soft contact shadow on the ground.
export function groundShadow(ctx, x, y, rx, ry, a = 0.3, color = '#1a0f2e') {
  ctx.fillStyle = alpha(color, a);
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
}

export function bubble(ctx, x, y, r) {
  if (!detail(ctx)) return;
  ctx.save();
  ctx.strokeStyle = 'rgba(230,250,255,0.85)';
  ctx.fillStyle = 'rgba(200,240,255,0.18)';
  ctx.lineWidth = 1.8;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.beginPath(); ctx.arc(x - r * 0.35, y - r * 0.35, r * 0.28, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// Seeded tiny PRNG so variants are stable across bakes.
export function rng(seed) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

export const TAU = Math.PI * 2;
export const wave = (t, k = 1, ph = 0) => Math.sin(TAU * (t * k + ph));
