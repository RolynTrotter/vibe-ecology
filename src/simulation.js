// ===========================================================================
//  Simulation — one tick of ecosystem logic over the EntityStore.
// ===========================================================================
import {
  SPECIES, CONFIG, MAX_INTERACTION_RADIUS, MIN_HABITABLE,
  coralHides, coralBlocksMovement,
} from './config.js';
import { World, makeRng } from './world.js';
import { EntityStore, ENTITY_STATE } from './entities.js';
import { SpatialGrid } from './spatial.js';

// Animals never freeze completely on poor ground; speed floors at this
// fraction of their max, scaling up to full speed in ideal habitat.
const MIN_SPEED_FACTOR = 0.35;

// A fresh carcass holds this fraction of the animal's max energy as meat for
// scavengers; each scavenger bite takes up to SCAVENGE_BITE of it.
const CARRION_FRACTION = 0.6;
const SCAVENGE_BITE = 6;

export class Simulation {
  constructor() {
    this.world = new World();
    this.store = new EntityStore(CONFIG.sim.maxEntities);
    // Bucket size is deliberately smaller than the largest interaction radius:
    // big buckets would force every query (even a short-sighted Ghoti) to scan
    // a huge neighbourhood. Smaller buckets mean small-radius queries touch far
    // fewer candidates; the rare large-radius queries just scan an extra ring.
    const bucket = Math.max(3, Math.ceil(MAX_INTERACTION_RADIUS / 2));
    this.grid = new SpatialGrid(
      this.world.width, this.world.height, bucket, CONFIG.sim.maxEntities
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

  // Pick a random world position habitable for `sp`, biased toward the core of
  // its habitat (accept with probability == suitability), with a fallback to
  // any merely-habitable cell so rare niches still get seeded.
  randomCellFor(sp) {
    const w = this.world;
    let fallback = null;
    for (let tries = 0; tries < 60; tries++) {
      const x = this.rand() * w.width;
      const y = this.rand() * w.height;
      if (sp.kind === 'animal' && coralBlocksMovement(sp, w.terrainAt(x, y))) continue;
      const suit = w.suitability(x, y, sp);
      if (suit >= MIN_HABITABLE) {
        if (this.rand() < suit) return [x, y];
        if (!fallback) fallback = [x, y];
      }
    }
    return fallback;
  }

  seedPopulations() {
    for (const sp of SPECIES) this.spawnSpecies(sp, CONFIG.initial[sp.id] || 0);
  }

  // Spawn up to `n` individuals of a species into habitable cells. Used both
  // for initial seeding and for the dev "spawn more" injector. Returns the
  // count actually spawned.
  spawnSpecies(sp, n) {
    let spawned = 0;
    for (let k = 0; k < n; k++) {
      const pos = this.randomCellFor(sp);
      if (!pos) continue;
      const energy = sp.kind === 'plant'
        ? sp.maxEnergy * (0.3 + 0.7 * this.rand())
        : sp.maxEnergy * (0.5 + 0.4 * this.rand());
      const i = this.store.spawn(sp.index, pos[0], pos[1], energy);
      if (i < 0) break; // at capacity
      const a = this.rand() * Math.PI * 2;
      this.store.hx[i] = Math.cos(a);
      this.store.hy[i] = Math.sin(a);
      // Seed a realistic spread of ages, not just juveniles: long-lived animals
      // get the full span up to their lifespan, so the starting population
      // already has elders that die of old age early (and leave carrion for
      // scavengers from the outset).
      const maxAge = sp.lifespan || sp.matureAge * 1.5;
      this.store.age[i] = this.rand() * maxAge;
      spawned++;
    }
    return spawned;
  }

  step() {
    const s = this.store;
    this.grid.rebuild(s);
    const n = s.highWater;
    for (let i = 0; i < n; i++) {
      if (!s.alive[i]) continue;
      if (s.state[i] === ENTITY_STATE.DECAYING) { this.stepDecay(i); continue; }
      const sp = SPECIES[s.species[i]];
      if (sp.kind === 'plant') this.stepPlant(i, sp);
      else if (sp.scavenger) this.stepScavenger(i, sp);
      else this.stepAnimal(i, sp);
    }
    this.tick++;
  }

  // A corpse counts down and is recycled when fully rotted (if a scavenger
  // hasn't already eaten it).
  stepDecay(i) {
    const s = this.store;
    if ((s.decay[i] -= 1) <= 0) s.kill(i);
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
    if (this.world.suitability(nx, ny, sp) < MIN_HABITABLE) return;

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
          if (s.state[j] === ENTITY_STATE.DECAYING) continue; // carcasses don't crowd
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
      if (this.rand() < 0.004 * (1 + over * 6)) {
        s.die(i, CONFIG.sim.decayTicks);             // leave a fading carcass
        s.energy[i] = sp.maxEnergy * CARRION_FRACTION; // meat available to scavengers
        return;
      }
    }

    const px = s.x[i], py = s.y[i];
    let steerX = s.hx[i], steerY = s.hy[i];
    let acted = false;

    // 1) Flee the nearest predator.
    if (sp.fleeFactor > 0 && sp.predatorMask) {
      const pred = this._findNearest(px, py, sp.sense, sp.predatorMask, null);
      if (pred >= 0) {
        let dx = px - s.x[pred], dy = py - s.y[pred];
        const d = Math.hypot(dx, dy) || 1;
        steerX = dx / d; steerY = dy / d;
        acted = true;
      }
    }

    // 2) Hungry? Seek the nearest edible thing, and eat it if close.
    if (!acted && s.energy[i] < sp.maxEnergy * sp.hungerAt && sp.dietMask) {
      // Pass `sp` so predators can't target prey hiding in coral.
      const food = this._findNearest(px, py, sp.sense, sp.dietMask, sp);
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

  // ---- Scavengers (Necrow) ----------------------------------------------
  // Soar and wander; when hungry, home in on the nearest carcass and feed.
  // Feeding pins it to the ground (where a predator can reach it) and, once the
  // carcass is stripped, fertilizes a little burst of plant growth.
  stepScavenger(i, sp) {
    const s = this.store;
    s.age[i] += 1;
    if (s.reproTimer[i] > 0) s.reproTimer[i] -= 1;
    s.energy[i] -= sp.metabolism * (0.6 + 0.4 * sp.size);
    if (s.energy[i] <= 0) { s.kill(i); return; }

    const px = s.x[i], py = s.y[i];
    let steerX = s.hx[i], steerY = s.hy[i];
    let feeding = 0;

    const carcass = s.energy[i] < sp.maxEnergy * sp.hungerAt
      ? this._findNearestCorpse(px, py, sp.sense) : -1;
    if (carcass >= 0) {
      const dx = s.x[carcass] - px, dy = s.y[carcass] - py;
      const d = Math.hypot(dx, dy);
      if (d <= sp.size + 1.5) {
        this.eatCarrion(i, sp, carcass);
        feeding = 1;                         // grounded and exposed while it feeds
      } else {
        steerX = dx / (d || 1); steerY = dy / (d || 1);
      }
    } else {
      const t = (this.rand() - 0.5) * 0.6;   // soar/wander
      const cs = Math.cos(t), sn = Math.sin(t);
      steerX = s.hx[i] * cs - s.hy[i] * sn;
      steerY = s.hx[i] * sn + s.hy[i] * cs;
    }

    s.feeding[i] = feeding;
    this.move(i, sp, steerX, steerY);

    if (s.age[i] >= sp.matureAge && s.energy[i] >= sp.reproEnergy &&
        s.reproTimer[i] <= 0) {
      this.reproduce(i, sp);
    }
  }

  // Take a bite of a carcass; when it's stripped, recycle it and trigger a bloom.
  eatCarrion(i, sp, carcass) {
    const s = this.store;
    const bite = Math.min(SCAVENGE_BITE, s.energy[carcass]);
    s.energy[carcass] -= bite;
    s.energy[i] = Math.min(sp.maxEnergy, s.energy[i] + bite * sp.eatGain);
    if (s.energy[carcass] <= 0.5) {
      const cx = s.x[carcass], cy = s.y[carcass];
      s.kill(carcass);
      if (sp.bloomOnFeed) this.bloom(cx, cy);
    }
  }

  // A scavenger's leavings enrich the soil: sprout a couple of whatever plant
  // is best suited to this spot, right where the carcass was stripped.
  bloom(x, y) {
    const w = this.world;
    let best = null, bestSuit = MIN_HABITABLE;
    for (const sp of SPECIES) {
      if (sp.kind !== 'plant') continue;
      const suit = w.suitability(x, y, sp);
      if (suit > bestSuit) { bestSuit = suit; best = sp; }
    }
    if (!best) return;
    const sprouts = 1 + ((this.rand() * 2) | 0); // 1..2
    for (let k = 0; k < sprouts; k++) {
      const ang = this.rand() * Math.PI * 2;
      const dist = this.rand() * 3;
      const nx = x + Math.cos(ang) * dist, ny = y + Math.sin(ang) * dist;
      if (w.suitability(nx, ny, best) < MIN_HABITABLE) continue;
      this.store.spawn(best.index, nx, ny, best.maxEnergy * 0.4);
    }
  }

  // Move with a habitat constraint: the step can't land on uninhabitable
  // ground (suitability 0); if it would, bounce by trying axis-aligned slides,
  // else reverse heading. Speed scales smoothly with how suitable the current
  // ground is, so an animal slows as it strays off its preferred terrain.
  move(i, sp, dirX, dirY) {
    const s = this.store;
    const len = Math.hypot(dirX, dirY) || 1;
    let ux = dirX / len, uy = dirY / len;
    const sx = s.x[i], sy = s.y[i];
    const w = this.world;
    const suitHere = w.suitability(sx, sy, sp);
    const step = sp.speed * (MIN_SPEED_FACTOR + (1 - MIN_SPEED_FACTOR) * suitHere);

    // Can't step onto uninhabitable ground, nor into coral (unless a refuge
    // user or a flier passing overhead).
    const ok = (x, y) =>
      w.suitability(x, y, sp) > 0 && !coralBlocksMovement(sp, w.terrainAt(x, y));

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
    // Sexual species need a mature partner of their own kind nearby; a lone
    // disperser can't bud a child on its own.
    if (sp.sexual && !this._hasMateNear(i, sp)) {
      s.reproTimer[i] = sp.reproCooldown * 0.5; // check again for a mate later
      return;
    }
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
    if (this.world.suitability(nx, ny, sp) < MIN_HABITABLE ||
        coralBlocksMovement(sp, this.world.terrainAt(nx, ny))) { nx = s.x[i]; ny = s.y[i]; }
    const child = s.spawn(sp.index, nx, ny, sp.reproCost,
      Math.cos(ang), Math.sin(ang));
    if (child >= 0) {
      s.energy[i] -= sp.reproCost;
      s.reproTimer[i] = sp.reproCooldown;
    }
  }

  // Nearest entity whose species bit is set in `mask`, within `radius`.
  // If `searcher` is given, candidates hidden from it by coral are skipped (so
  // predators can't target prey sheltering on a reef).
  _findNearest(px, py, radius, mask, searcher) {
    const s = this.store, g = this.grid, w = this.world;
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
          if (s.state[j] === ENTITY_STATE.DECAYING) continue;   // carcasses aren't hunted/fled
          // Necrow (feedingVulnerable) can only be targeted while down on a carcass.
          const cj = SPECIES[s.species[j]];
          if (cj.feedingVulnerable && !s.feeding[j]) continue;
          const dx = s.x[j] - px, dy = s.y[j] - py;
          const d2 = dx * dx + dy * dy;
          if (d2 < bestD && d2 <= r2) {
            if (searcher && coralHides(searcher, w.terrainAt(s.x[j], s.y[j]))) continue;
            bestD = d2; best = j;
          }
        }
      }
    }
    return best;
  }

  // Nearest decaying carcass within `radius`, regardless of species.
  _findNearestCorpse(px, py, radius) {
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
          if (s.state[j] !== ENTITY_STATE.DECAYING) continue;
          const dx = s.x[j] - px, dy = s.y[j] - py;
          const d2 = dx * dx + dy * dy;
          if (d2 < bestD && d2 <= r2) { bestD = d2; best = j; }
        }
      }
    }
    return best;
  }

  // Is there another mature, living member of `sp` within its mate radius?
  _hasMateNear(i, sp) {
    const s = this.store, g = this.grid;
    const radius = sp.mateRadius || sp.sense || 8;
    const r2 = radius * radius;
    const idx = sp.index;
    const px = s.x[i], py = s.y[i];
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
          if (j === i || s.species[j] !== idx) continue;
          if (s.state[j] !== ENTITY_STATE.ALIVE || s.age[j] < sp.matureAge) continue;
          const dx = s.x[j] - px, dy = s.y[j] - py;
          if (dx * dx + dy * dy <= r2) return true;
        }
      }
    }
    return false;
  }
}
