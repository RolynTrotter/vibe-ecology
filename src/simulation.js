// ===========================================================================
//  Simulation — one tick of ecosystem logic over the EntityStore.
// ===========================================================================
import { SPECIES, CONFIG, MAX_INTERACTION_RADIUS } from './config.js';
import { World, makeRng } from './world.js';
import { EntityStore } from './entities.js';
import { SpatialGrid } from './spatial.js';

export class Simulation {
  constructor() {
    this.world = new World();
    this.store = new EntityStore(CONFIG.sim.maxEntities);
    this.grid = new SpatialGrid(
      this.world.width, this.world.height,
      Math.max(2, Math.ceil(MAX_INTERACTION_RADIUS)),
      CONFIG.sim.maxEntities
    );
    this.rng = makeRng(CONFIG.world.seed ^ 0x9e3779b9);
    this.tick = 0;

    // Scratch state used inside neighbour callbacks (avoids closures-per-call).
    this._best = -1;
    this._bestDist = 0;
    this._px = 0; this._py = 0;

    // Bound field (not a prototype method) so it can be passed around detached,
    // e.g. as the RNG source for the harvest controller.
    this.rand = () => this.rng();

    this.seedPopulations();
  }

  // Pick a random world position whose terrain matches `terrainMask`.
  randomCellFor(terrainMask) {
    const w = this.world;
    for (let tries = 0; tries < 30; tries++) {
      const x = this.rand() * w.width;
      const y = this.rand() * w.height;
      const t = w.terrainAt(x, y);
      if (t >= 0 && (terrainMask & (1 << t))) return [x, y];
    }
    return null;
  }

  seedPopulations() {
    for (const sp of SPECIES) {
      const n = CONFIG.initial[sp.id] || 0;
      for (let k = 0; k < n; k++) {
        const pos = this.randomCellFor(sp.terrainMask);
        if (!pos) continue;
        const energy = sp.kind === 'plant'
          ? sp.maxEnergy * (0.3 + 0.7 * this.rand())
          : sp.maxEnergy * (0.5 + 0.4 * this.rand());
        const i = this.store.spawn(sp.index, pos[0], pos[1], energy);
        if (i < 0) break;
        // Random initial heading + a head start on age so they're not all
        // born simultaneously.
        const a = this.rand() * Math.PI * 2;
        this.store.hx[i] = Math.cos(a);
        this.store.hy[i] = Math.sin(a);
        this.store.age[i] = this.rand() * sp.matureAge;
      }
    }
  }

  step() {
    const s = this.store;
    this.grid.rebuild(s);
    const n = s.highWater;
    for (let i = 0; i < n; i++) {
      if (!s.alive[i]) continue;
      const sp = SPECIES[s.species[i]];
      if (sp.kind === 'plant') this.stepPlant(i, sp);
      else this.stepAnimal(i, sp);
    }
    this.tick++;
  }

  // ---- Plants -----------------------------------------------------------
  stepPlant(i, sp) {
    const s = this.store;
    s.age[i] += 1;
    if (s.reproTimer[i] > 0) s.reproTimer[i] -= 1;
    if (s.energy[i] < sp.maxEnergy) {
      s.energy[i] = Math.min(sp.maxEnergy, s.energy[i] + sp.growth);
    }
    if (s.age[i] >= sp.matureAge && s.energy[i] >= sp.reproEnergy &&
        s.reproTimer[i] <= 0) {
      this.trySpread(i, sp);
    }
  }

  trySpread(i, sp) {
    const s = this.store;
    // Don't spread into an already-crowded patch.
    const myIdx = sp.index;
    let crowd = 0;
    this._countSpeciesNear(s.x[i], s.y[i], sp.spreadRadius, myIdx);
    crowd = this._best; // _countSpeciesNear stuffs the tally into _best
    if (crowd > sp.crowdLimit) return;

    const ang = this.rand() * Math.PI * 2;
    const dist = 1 + this.rand() * sp.spreadRadius;
    const nx = s.x[i] + Math.cos(ang) * dist;
    const ny = s.y[i] + Math.sin(ang) * dist;
    const t = this.world.terrainAt(nx, ny);
    if (t < 0 || !(sp.terrainMask & (1 << t))) return;

    const child = s.spawn(myIdx, nx, ny, sp.reproCost);
    if (child >= 0) {
      s.energy[i] -= sp.reproCost;
      s.reproTimer[i] = sp.reproCooldown;
    }
  }

  _countSpeciesNear(px, py, radius, speciesIdx) {
    const s = this.store, g = this.grid;
    const r2 = radius * radius;
    let tally = 0;
    const r = Math.max(1, Math.ceil(radius / g.cellSize));
    const cx = (px / g.cellSize) | 0, cy = (py / g.cellSize) | 0;
    const minX = Math.max(0, cx - r), maxX = Math.min(g.cols - 1, cx + r);
    const minY = Math.max(0, cy - r), maxY = Math.min(g.rows - 1, cy + r);
    for (let gy = minY; gy <= maxY; gy++) {
      const rowBase = gy * g.cols;
      for (let gx = minX; gx <= maxX; gx++) {
        const c = rowBase + gx, end = g.cellStart[c + 1];
        for (let k = g.cellStart[c]; k < end; k++) {
          const j = g.items[k];
          if (s.species[j] !== speciesIdx) continue;
          const dx = s.x[j] - px, dy = s.y[j] - py;
          if (dx * dx + dy * dy <= r2) tally++;
        }
      }
    }
    this._best = tally;
  }

  // ---- Animals ----------------------------------------------------------
  stepAnimal(i, sp) {
    const s = this.store;
    s.age[i] += 1;
    if (s.reproTimer[i] > 0) s.reproTimer[i] -= 1;

    // Metabolism scales gently with body size.
    s.energy[i] -= sp.metabolism * (0.6 + 0.4 * sp.size);
    if (s.energy[i] <= 0) { s.kill(i); return; }

    // Senescence: past their lifespan, death chance ramps with age. Turnover
    // caps standing populations and stops long-lived predators from slowly
    // ratcheting up and grinding their prey to extinction.
    if (sp.lifespan && s.age[i] > sp.lifespan) {
      const over = (s.age[i] - sp.lifespan) / sp.lifespan;
      if (this.rand() < 0.004 * (1 + over * 6)) { s.kill(i); return; }
    }

    const px = s.x[i], py = s.y[i];
    let steerX = s.hx[i], steerY = s.hy[i];
    let acted = false;

    // 1) Flee the nearest predator.
    if (sp.fleeFactor > 0 && sp.predatorMask) {
      const pred = this._findNearest(px, py, sp.sense, sp.predatorMask, true);
      if (pred >= 0) {
        let dx = px - s.x[pred], dy = py - s.y[pred];
        const d = Math.hypot(dx, dy) || 1;
        steerX = dx / d; steerY = dy / d;
        acted = true;
      }
    }

    // 2) Hungry? Seek the nearest edible thing, and eat it if close.
    if (!acted && s.energy[i] < sp.maxEnergy * sp.hungerAt && sp.dietMask) {
      const food = this._findNearest(px, py, sp.sense, sp.dietMask, false);
      if (food >= 0) {
        const dx = s.x[food] - px, dy = s.y[food] - py;
        const d = Math.hypot(dx, dy);
        const eatDist = sp.size + SPECIES[s.species[food]].size * 0.5;
        if (d <= eatDist) {
          this.eat(i, sp, food);
        } else {
          steerX = dx / (d || 1); steerY = dy / (d || 1);
        }
        acted = true;
      }
    }

    // 3) Otherwise wander: nudge heading by a small random angle.
    if (!acted) {
      const turn = (this.rand() - 0.5) * 0.6;
      const cs = Math.cos(turn), sn = Math.sin(turn);
      steerX = s.hx[i] * cs - s.hy[i] * sn;
      steerY = s.hx[i] * sn + s.hy[i] * cs;
    }

    this.move(i, sp, steerX, steerY);

    // 4) Reproduce when well-fed and mature.
    if (s.age[i] >= sp.matureAge && s.energy[i] >= sp.reproEnergy &&
        s.reproTimer[i] <= 0) {
      this.reproduce(i, sp);
    }
  }

  // Move with terrain constraint: if the step would land on forbidden
  // terrain, bounce by trying axis-aligned slides, else reverse heading.
  move(i, sp, dirX, dirY) {
    const s = this.store;
    const len = Math.hypot(dirX, dirY) || 1;
    let ux = dirX / len, uy = dirY / len;
    const sx = s.x[i], sy = s.y[i];
    const step = sp.speed;
    const w = this.world;

    const ok = (x, y) => {
      const t = w.terrainAt(x, y);
      return t >= 0 && (sp.terrainMask & (1 << t));
    };

    let nx = sx + ux * step, ny = sy + uy * step;
    if (!ok(nx, ny)) {
      // Try sliding along X only, then Y only.
      if (ok(sx + ux * step, sy)) { ny = sy; }
      else if (ok(sx, sy + uy * step)) { nx = sx; }
      else { ux = -ux; uy = -uy; nx = sx + ux * step; ny = sy + uy * step; }
      if (!ok(nx, ny)) { nx = sx; ny = sy; } // truly stuck: stay put
    }
    // Keep inside the world.
    if (nx < 0.01) nx = 0.01; else if (nx > w.width - 0.01) nx = w.width - 0.01;
    if (ny < 0.01) ny = 0.01; else if (ny > w.height - 0.01) ny = w.height - 0.01;
    s.x[i] = nx; s.y[i] = ny;
    s.hx[i] = ux; s.hy[i] = uy;
  }

  eat(i, sp, prey) {
    const s = this.store;
    const preySp = SPECIES[s.species[prey]];
    if (preySp.kind === 'plant') {
      // Graze a bite; the plant survives unless drained.
      const bite = Math.min(preySp.biteEnergy, s.energy[prey]);
      s.energy[prey] -= bite;
      s.energy[i] = Math.min(sp.maxEnergy, s.energy[i] + bite * sp.eatGain);
      if (s.energy[prey] <= 0.5) s.kill(prey);
    } else {
      // Eat the whole animal.
      s.energy[i] = Math.min(sp.maxEnergy,
        s.energy[i] + s.energy[prey] * sp.eatGain + preySp.maxEnergy * 0.15);
      s.kill(prey);
    }
  }

  reproduce(i, sp) {
    const s = this.store;
    // Density dependence (local carrying capacity) — the key stabilizer that
    // keeps predator/prey oscillations from diverging into extinction.
    if (sp.crowdLimit !== undefined) {
      this._countSpeciesNear(s.x[i], s.y[i], sp.crowdRadius, sp.index);
      if (this._best > sp.crowdLimit) {
        s.reproTimer[i] = sp.reproCooldown * 0.5; // try again later
        return;
      }
    }
    const ang = this.rand() * Math.PI * 2;
    const dist = sp.size + 1 + this.rand() * 2;
    let nx = s.x[i] + Math.cos(ang) * dist;
    let ny = s.y[i] + Math.sin(ang) * dist;
    const t = this.world.terrainAt(nx, ny);
    if (t < 0 || !(sp.terrainMask & (1 << t))) { nx = s.x[i]; ny = s.y[i]; }
    const child = s.spawn(sp.index, nx, ny, sp.reproCost,
      Math.cos(ang), Math.sin(ang));
    if (child >= 0) {
      s.energy[i] -= sp.reproCost;
      s.reproTimer[i] = sp.reproCooldown;
    }
  }

  // Nearest entity whose species bit is set in `mask`, within `radius`.
  // `avoidSelfSpecies` is unused flag kept for clarity of intent.
  _findNearest(px, py, radius, mask, _flee) {
    const s = this.store, g = this.grid;
    const r2 = radius * radius;
    let best = -1, bestD = r2 + 1;
    const r = Math.max(1, Math.ceil(radius / g.cellSize));
    const cx = (px / g.cellSize) | 0, cy = (py / g.cellSize) | 0;
    const minX = Math.max(0, cx - r), maxX = Math.min(g.cols - 1, cx + r);
    const minY = Math.max(0, cy - r), maxY = Math.min(g.rows - 1, cy + r);
    for (let gy = minY; gy <= maxY; gy++) {
      const rowBase = gy * g.cols;
      for (let gx = minX; gx <= maxX; gx++) {
        const c = rowBase + gx, end = g.cellStart[c + 1];
        for (let k = g.cellStart[c]; k < end; k++) {
          const j = g.items[k];
          if (!(mask & (1 << s.species[j]))) continue;
          const dx = s.x[j] - px, dy = s.y[j] - py;
          const d2 = dx * dx + dy * dy;
          if (d2 < bestD && d2 <= r2) { bestD = d2; best = j; }
        }
      }
    }
    return best;
  }
}
