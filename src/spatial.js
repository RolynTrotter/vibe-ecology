// ===========================================================================
//  SpatialGrid — uniform-bucket spatial index rebuilt each tick via a
//  counting sort. No per-frame allocation, so it stays fast with tens of
//  thousands of agents.
// ===========================================================================
export class SpatialGrid {
  constructor(worldW, worldH, cellSize, capacity) {
    this.cellSize = cellSize;
    this.cols = Math.ceil(worldW / cellSize);
    this.rows = Math.ceil(worldH / cellSize);
    this.nCells = this.cols * this.rows;

    // Counting-sort scratch: cellCount[c] entities live in cell c, starting at
    // cellStart[c] within the `items` array (entity indices, sorted by cell).
    this.cellCount = new Int32Array(this.nCells);
    this.cellStart = new Int32Array(this.nCells + 1);
    this.cursor = new Int32Array(this.nCells);
    this.items = new Int32Array(capacity);
    this._cellOf = new Int32Array(capacity); // cached cell per slot
  }

  cellIndex(wx, wy) {
    let cx = (wx / this.cellSize) | 0;
    let cy = (wy / this.cellSize) | 0;
    if (cx < 0) cx = 0; else if (cx >= this.cols) cx = this.cols - 1;
    if (cy < 0) cy = 0; else if (cy >= this.rows) cy = this.rows - 1;
    return cy * this.cols + cx;
  }

  // Rebuild from the entity store. `count` is the high-water slot count;
  // alive[i] marks live slots.
  rebuild(store) {
    const { x, y, alive } = store;
    const n = store.highWater;
    this.cellCount.fill(0);

    for (let i = 0; i < n; i++) {
      if (!alive[i]) { this._cellOf[i] = -1; continue; }
      const c = this.cellIndex(x[i], y[i]);
      this._cellOf[i] = c;
      this.cellCount[c]++;
    }
    // Prefix sum -> start offsets.
    let acc = 0;
    for (let c = 0; c < this.nCells; c++) {
      this.cellStart[c] = acc;
      acc += this.cellCount[c];
    }
    this.cellStart[this.nCells] = acc;
    // Scatter entity indices into items[] using a moving cursor per cell.
    this.cursor.set(this.cellStart.subarray(0, this.nCells));
    for (let i = 0; i < n; i++) {
      const c = this._cellOf[i];
      if (c < 0) continue;
      this.items[this.cursor[c]++] = i;
    }
  }

  // Neighbour iteration is performed by the simulation directly against the
  // public fields below (cellSize, cols, rows, cellStart, items) so the hot
  // foraging/flee/crowding queries avoid a per-call closure allocation.
}
