// ===========================================================================
//  Vibe Ecology — central configuration
//  Everything here is meant to be tunable. Balancing a living predator/prey
//  ecosystem is genuinely fiddly, so these are sensible starting values; nudge
//  them and watch the population graphs respond.
// ===========================================================================

// --- Terrain -------------------------------------------------------------
export const TERRAIN = {
  DIRT: 0,
  SHALLOW_WATER: 1,
};

export const TERRAIN_INFO = [
  { id: 'dirt', name: 'Dirt', color: '#7a5c3a', minimap: '#8a6a44' },
  { id: 'water', name: 'Shallow Water', color: '#2f7fa8', minimap: '#3f93bd' },
];

// Convenience masks (bit per terrain type) for fast "can I be here" checks.
const T = (...types) => types.reduce((m, t) => m | (1 << t), 0);

// --- Species -------------------------------------------------------------
// kind: 'plant' | 'animal'
// terrains: array of TERRAIN values this organism may occupy.
// diet: array of species ids this organism eats (animals only).
//
// Plant tuning:
//   growth        energy gained per tick (photosynthesis)
//   maxEnergy     energy cap == fully grown
//   matureAge     ticks before it can spread
//   reproEnergy   energy needed to spread a seed
//   reproCost     energy spent spreading
//   reproCooldown ticks between spreads
//   spreadRadius  how far seeds land (world units)
//   crowdLimit    max same-species neighbours before it stops spreading
//   biteEnergy    energy a grazer gains per bite (and the plant loses)
//
// Animal tuning:
//   size          render size + caloric scaling
//   speed         world units per tick
//   sense         radius it can detect food/threats (world units)
//   metabolism    energy burned per tick
//   maxEnergy     energy cap
//   hungerAt      seek food when energy below this fraction of maxEnergy
//   eatGain       fraction of prey energy converted to own energy
//   matureAge     ticks before it can reproduce
//   reproEnergy   energy needed to reproduce
//   reproCost     energy spent reproducing (becomes child's starting energy)
//   reproCooldown ticks between reproductions
//   fleeFactor    0..1 how strongly it flees predators (0 = oblivious)
//
// wexle: harvest values for the (future) colony layer — unused mechanically
//        for now, but defined so the data model is complete.
export const SPECIES = [
  {
    id: 'qelp', name: 'Qelp', kind: 'plant',
    color: '#2f8f5b', terrains: [TERRAIN.SHALLOW_WATER],
    size: 0.7,
    growth: 0.45, maxEnergy: 22, matureAge: 60,
    reproEnergy: 14, reproCost: 9, reproCooldown: 70,
    spreadRadius: 4.5, crowdLimit: 5, biteEnergy: 7,
    wexle: { food: 2, material: 3, value: 1 },
  },
  {
    id: 'naze', name: 'Naze', kind: 'plant',
    color: '#d4c24a', terrains: [TERRAIN.DIRT],
    size: 0.7,
    growth: 0.4, maxEnergy: 24, matureAge: 70,
    reproEnergy: 15, reproCost: 9, reproCooldown: 80,
    spreadRadius: 4, crowdLimit: 5, biteEnergy: 8,
    wexle: { food: 4, material: 1, value: 2 },
  },
  {
    id: 'ghoti', name: 'Ghoti', kind: 'animal',
    color: '#5fb6e6', terrains: [TERRAIN.SHALLOW_WATER],
    diet: ['qelp'],
    size: 0.9, speed: 0.16, sense: 6.5,
    metabolism: 0.05, maxEnergy: 42, hungerAt: 0.7, eatGain: 1.0,
    matureAge: 130, reproEnergy: 28, reproCost: 15, reproCooldown: 190,
    crowdRadius: 6, crowdLimit: 4,
    fleeFactor: 0.8,
    wexle: { food: 6, material: 2, value: 4 },
  },
  {
    id: 'latt', name: 'Latt', kind: 'animal',
    color: '#c98a4b', terrains: [TERRAIN.DIRT],
    diet: ['naze'],
    size: 0.9, speed: 0.17, sense: 6.5,
    metabolism: 0.05, maxEnergy: 42, hungerAt: 0.7, eatGain: 1.0,
    matureAge: 140, reproEnergy: 28, reproCost: 15, reproCooldown: 200,
    crowdRadius: 6, crowdLimit: 4,
    fleeFactor: 0.8,
    wexle: { food: 5, material: 3, value: 4 },
  },
  {
    id: 'daot', name: 'Daot', kind: 'animal',
    color: '#9b78d4', terrains: [TERRAIN.DIRT, TERRAIN.SHALLOW_WATER],
    diet: ['ghoti', 'latt'],
    size: 1.3, speed: 0.15, sense: 9,
    metabolism: 0.085, maxEnergy: 80, hungerAt: 0.8, eatGain: 0.55,
    matureAge: 350, reproEnergy: 60, reproCost: 36, reproCooldown: 480,
    crowdRadius: 16, crowdLimit: 1,
    fleeFactor: 0,
    wexle: { food: 9, material: 5, value: 8 },
  },
];

// --- World / simulation --------------------------------------------------
export const CONFIG = {
  world: {
    width: 220,        // grid cells wide
    height: 160,       // grid cells tall
    seed: 1337,
    // Fraction-ish controls for the procedural map (perlin-ish value noise).
    waterLevel: 0.46,  // higher => more water
    noiseScale: 0.06,  // smaller => bigger continents
  },

  sim: {
    ticksPerSecond: 30,   // simulation rate at 1x speed
    maxEntities: 70000,   // hard cap on living organisms
    cellPx: 1,            // world unit == 1 grid cell
  },

  // Starting populations.
  initial: {
    qelp: 1600,
    naze: 1600,
    ghoti: 240,
    latt: 240,
    daot: 22,
  },

  graph: {
    historyLength: 600,   // samples kept
    sampleEvery: 10,      // ticks between samples
  },
};

// --- Derived lookups (built once) ---------------------------------------
export const SPECIES_INDEX = {};
SPECIES.forEach((s, i) => { SPECIES_INDEX[s.id] = i; });

// Precompute, per species: terrain bitmask, diet bitmask, predator bitmask.
SPECIES.forEach((s, i) => {
  s.index = i;
  s.terrainMask = T(...s.terrains);
  s.dietMask = 0;
  (s.diet || []).forEach(id => { s.dietMask |= (1 << SPECIES_INDEX[id]); });
});
SPECIES.forEach((s, i) => {
  s.predatorMask = 0;
  SPECIES.forEach((other, j) => {
    if (other.dietMask & (1 << i)) s.predatorMask |= (1 << j);
  });
  // Largest sense radius among this species' predators — used for flee checks.
});

export const NUM_SPECIES = SPECIES.length;

// Largest radius any organism cares about — sizes the spatial grid buckets.
export const MAX_INTERACTION_RADIUS = Math.max(
  ...SPECIES.map(s => Math.max(s.sense || 0, s.spreadRadius || 0, 2))
);
