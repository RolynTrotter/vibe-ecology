// ===========================================================================
//  Input — touch (pan + pinch-zoom) and mouse/wheel fallbacks for desktop.
//  Also routes taps on the minimap to recentre the camera.
// ===========================================================================
export function attachInput(canvas, camera, minimap) {
  const pointers = new Map(); // pointerId -> {x, y}
  let pinchDist = 0;
  let pinchAngle = 0;
  let pinchMid = { x: 0, y: 0 };
  let rotAccum = 0;       // twist accumulated this gesture (for the engage threshold)
  let rotActive = false;  // has the twist passed the threshold yet?
  let movedSincePress = false;

  const updatePinch = () => {
    const pts = [...pointers.values()];
    const dx = pts[0].x - pts[1].x, dy = pts[0].y - pts[1].y;
    pinchDist = Math.hypot(dx, dy);
    pinchAngle = Math.atan2(dy, dx);
    pinchMid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
  };

  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    movedSincePress = false;
    if (pointers.size === 2) { updatePinch(); rotAccum = 0; rotActive = false; }
  });

  canvas.addEventListener('pointermove', (e) => {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    const nx = e.clientX, ny = e.clientY;

    if (pointers.size === 1) {
      const dx = nx - prev.x, dy = ny - prev.y;
      if (Math.abs(dx) + Math.abs(dy) > 2) movedSincePress = true;
      camera.panByPixels(dx, dy);
    }
    pointers.set(e.pointerId, { x: nx, y: ny });

    if (pointers.size === 2) {
      const rect = canvas.getBoundingClientRect();
      const oldDist = pinchDist, oldAngle = pinchAngle;
      const oldMidX = pinchMid.x - rect.left, oldMidY = pinchMid.y - rect.top;
      updatePinch();
      if (oldDist > 0) {
        const newMidX = pinchMid.x - rect.left, newMidY = pinchMid.y - rect.top;
        // World point under the gesture's previous midpoint, captured before we
        // change anything.
        const wpt = camera.screenToWorld(oldMidX, oldMidY);
        camera.zoomBy(pinchDist / oldDist);
        // Engage rotation only once the twist passes a small threshold, so a
        // straight pinch/drag doesn't accidentally spin the map.
        let dA = pinchAngle - oldAngle;
        if (dA > Math.PI) dA -= 2 * Math.PI; else if (dA < -Math.PI) dA += 2 * Math.PI;
        rotAccum += dA;
        if (!rotActive && Math.abs(rotAccum) > 0.12) rotActive = true;
        if (rotActive) camera.rotateBy(dA);
        // Re-anchor that world point under the new midpoint: this keeps the
        // pinch/twist pivoting about the fingers and gives two-finger pan.
        camera.anchorAt(wpt.x, wpt.y, newMidX, newMidY);
        camera.clamp();
      }
      movedSincePress = true;
    }
  });

  const endPointer = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) { pinchDist = 0; rotAccum = 0; rotActive = false; }
  };
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);

  // Desktop mouse wheel = zoom.
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    camera.zoomAt(e.clientX - rect.left, e.clientY - rect.top, factor);
  }, { passive: false });

  // Minimap tap/drag to recentre.
  const recenterFromMinimap = (e) => {
    const rect = minimap.getBoundingClientRect();
    const fx = (e.clientX - rect.left) / rect.width;
    const fy = (e.clientY - rect.top) / rect.height;
    camera.x = fx * camera.world.width;
    camera.y = fy * camera.world.height;
    camera.clamp();
  };
  minimap.addEventListener('pointerdown', (e) => {
    minimap.setPointerCapture(e.pointerId);
    recenterFromMinimap(e);
  });
  minimap.addEventListener('pointermove', (e) => {
    if (e.buttons) recenterFromMinimap(e);
  });

  return { isDrag: () => movedSincePress };
}
