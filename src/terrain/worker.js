// ===========================================================================
//  terrain/worker — bakes terrain tiles off the main thread.
//  Rebuilds the same World from its config (generation is deterministic), then
//  paints requested tiles into an OffscreenCanvas and ships them back as
//  transferable ImageBitmaps.
// ===========================================================================
import { World } from '../world.js';
import { bakeTile } from './art.js';

let world = null;
const makeCanvas = (w, h) => new OffscreenCanvas(w, h);

self.onmessage = (e) => {
  const m = e.data;
  if (m.type === 'init') {
    let ok = false;
    try { ok = !!new OffscreenCanvas(1, 1).getContext('2d'); } catch (_) { ok = false; }
    if (ok) world = new World(m.cfg);
    self.postMessage({ type: 'ready', ok });
  } else if (m.type === 'tile' && world) {
    const canvas = bakeTile(world, m.P, m.tx, m.ty, makeCanvas);
    const bmp = canvas.transferToImageBitmap();
    self.postMessage({ type: 'tile', key: m.key, bmp }, [bmp]);
  }
};
