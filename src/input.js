// ===========================================================================
//  Input — touch (pan + pinch-zoom) and mouse/wheel fallbacks for desktop.
//  Also routes taps on the minimap to recentre the camera.
// ===========================================================================
export function attachInput(canvas, camera, minimap) {
  const pointers = new Map(); // pointerId -> {x, y}
  let pinchDist = 0;
  let pinchMid = { x: 0, y: 0 };
  let movedSincePress = false;

  const updatePinch = () => {
    const pts = [...pointers.values()];
    const dx = pts[0].x - pts[1].x, dy = pts[0].y - pts[1].y;
    pinchDist = Math.hypot(dx, dy);
    pinchMid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
  };

  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    movedSincePress = false;
    if (pointers.size === 2) updatePinch();
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
      const oldDist = pinchDist;
      updatePinch();
      if (oldDist > 0) {
        const rect = canvas.getBoundingClientRect();
        camera.zoomAt(pinchMid.x - rect.left, pinchMid.y - rect.top,
          pinchDist / oldDist);
      }
      movedSincePress = true;
    }
  });

  const endPointer = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchDist = 0;
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
