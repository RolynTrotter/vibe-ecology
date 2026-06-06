// ===========================================================================
//  Camera — maps world (grid) coordinates to screen pixels with pan + zoom.
// ===========================================================================
export class Camera {
  constructor(world) {
    this.world = world;
    this.x = world.width / 2;   // world coords at screen centre
    this.y = world.height / 2;
    this.zoom = 6;              // screen pixels per world unit
    this.minZoom = 1.5;
    this.maxZoom = 40;
    this.rot = 0;              // view rotation (radians), driven by two-finger twist
    this.viewW = 1;
    this.viewH = 1;
  }

  setViewport(w, h) { this.viewW = w; this.viewH = h; }

  // Fit so a sensible chunk of the world is visible on first load.
  fitToWidth(fraction = 1) {
    const z = (this.viewW / (this.world.width * fraction));
    this.zoom = Math.min(this.maxZoom, Math.max(this.minZoom, z));
    this.clamp();
  }

  // Pre-rotation screen position of a world point. The renderer applies the
  // view rotation itself (as a canvas transform), so these stay rotation-free.
  worldToScreenX(wx) { return (wx - this.x) * this.zoom + this.viewW / 2; }
  worldToScreenY(wy) { return (wy - this.y) * this.zoom + this.viewH / 2; }

  // Full inverse transform: screen pixel -> world, undoing zoom AND rotation
  // about the screen centre.
  screenToWorld(sx, sy) {
    const dx = sx - this.viewW / 2, dy = sy - this.viewH / 2;
    const c = Math.cos(-this.rot), s = Math.sin(-this.rot);
    return {
      x: (dx * c - dy * s) / this.zoom + this.x,
      y: (dx * s + dy * c) / this.zoom + this.y,
    };
  }

  // Place the camera so world point (wx,wy) sits under screen pixel (sx,sy),
  // honouring the current zoom and rotation. The anchor for pan/zoom/rotate.
  anchorAt(wx, wy, sx, sy) {
    const dx = sx - this.viewW / 2, dy = sy - this.viewH / 2;
    const c = Math.cos(-this.rot), s = Math.sin(-this.rot);
    this.x = wx - (dx * c - dy * s) / this.zoom;
    this.y = wy - (dx * s + dy * c) / this.zoom;
  }

  zoomBy(factor) {
    this.zoom = Math.min(this.maxZoom, Math.max(this.minZoom, this.zoom * factor));
  }

  rotateBy(dAngle) {
    let r = this.rot + dAngle;
    if (r > Math.PI) r -= 2 * Math.PI; else if (r < -Math.PI) r += 2 * Math.PI;
    this.rot = r;
  }

  // Drag pan: a screen-space delta moved into the (possibly rotated) world.
  panByPixels(dx, dy) {
    const c = Math.cos(-this.rot), s = Math.sin(-this.rot);
    this.x -= (dx * c - dy * s) / this.zoom;
    this.y -= (dx * s + dy * c) / this.zoom;
    this.clamp();
  }

  // Zoom keeping the world point under (screenX, screenY) fixed.
  zoomAt(screenX, screenY, factor) {
    const w = this.screenToWorld(screenX, screenY);
    this.zoomBy(factor);
    this.anchorAt(w.x, w.y, screenX, screenY);
    this.clamp();
  }

  clamp() {
    // Keep the camera centre within the world so we don't drift into the void.
    const halfW = this.viewW / 2 / this.zoom;
    const halfH = this.viewH / 2 / this.zoom;
    const w = this.world;
    if (w.width <= halfW * 2) this.x = w.width / 2;
    else this.x = Math.min(w.width - halfW, Math.max(halfW, this.x));
    if (w.height <= halfH * 2) this.y = w.height / 2;
    else this.y = Math.min(w.height - halfH, Math.max(halfH, this.y));
  }

  // Axis-aligned world-space bounding box of the (possibly rotated) viewport,
  // for culling. Reduces to the exact view rect when rot == 0.
  visibleBounds() {
    const a = this.screenToWorld(0, 0);
    const b = this.screenToWorld(this.viewW, 0);
    const c = this.screenToWorld(0, this.viewH);
    const d = this.screenToWorld(this.viewW, this.viewH);
    return {
      x0: Math.min(a.x, b.x, c.x, d.x),
      y0: Math.min(a.y, b.y, c.y, d.y),
      x1: Math.max(a.x, b.x, c.x, d.x),
      y1: Math.max(a.y, b.y, c.y, d.y),
    };
  }
}
