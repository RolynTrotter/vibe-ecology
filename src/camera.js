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

  worldToScreenX(wx) { return (wx - this.x) * this.zoom + this.viewW / 2; }
  worldToScreenY(wy) { return (wy - this.y) * this.zoom + this.viewH / 2; }
  screenToWorldX(sx) { return (sx - this.viewW / 2) / this.zoom + this.x; }
  screenToWorldY(sy) { return (sy - this.viewH / 2) / this.zoom + this.y; }

  panByPixels(dx, dy) {
    this.x -= dx / this.zoom;
    this.y -= dy / this.zoom;
    this.clamp();
  }

  // Zoom keeping the world point under (screenX, screenY) fixed.
  zoomAt(screenX, screenY, factor) {
    const wx = this.screenToWorldX(screenX);
    const wy = this.screenToWorldY(screenY);
    this.zoom = Math.min(this.maxZoom, Math.max(this.minZoom, this.zoom * factor));
    // Solve for camera position so (wx,wy) stays under the same screen point.
    this.x = wx - (screenX - this.viewW / 2) / this.zoom;
    this.y = wy - (screenY - this.viewH / 2) / this.zoom;
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

  // Visible world-rect (for culling), in world units.
  visibleBounds() {
    return {
      x0: this.screenToWorldX(0),
      y0: this.screenToWorldY(0),
      x1: this.screenToWorldX(this.viewW),
      y1: this.screenToWorldY(this.viewH),
    };
  }
}
