// ===========================================================================
//  Vibe Ecology — central configuration
//  Tunable data for terrain, species, and the simulation. Balancing a living
//  food web is fiddly; these are starting values. Tweak and re-run
//  `node tools/trace.mjs` to watch the populations respond.
// ===========================================================================

// --- Continuous terrain fields ------------------------------------------
// Terrain is generated as smooth scalar fields in [0,1]; discrete terrain
// *types* (for color + legend) are derived from them, and species habitat is
// expressed as tolerance bands over them (see SPECIES.habitat).
export const FIELD = { ELEVATION: 0, MOISTURE: 1, ROCKINESS: 2 };
export const NUM_FIELDS = 3;

// How far (in field units) suitability ramps from 1 down to 0 outside a band.
// Drives the "smooth loss of speed when off your preferred ground" feel.
export const HABITAT_SOFTNESS = 0.1;

// --- Discrete terrain types (derived from fields) -----------------------
export const TERRAIN = {
  DEEP_WATER: 0,
  SHALLOW_WATER: 1,
  SAND: 2,
  DIRT: 3,
  MUD: 4,
  ROCK: 5,
  CORAL: 6,   // a feature on water cells (see World.generate); a fish refuge
};

export const TERRAIN_INFO = [
  { id: 'deep_water', name: 'Deep Water', color: '#1f5e80', minimap: '#27719a' },
  { id: 'water', name: 'Shallow Water', color: '#2f7fa8', minimap: '#3f93bd' },
  { id: 'sand', name: 'Sand', color: '#d8c98f', minimap: '#e0d29a' },
  { id: 'dirt', name: 'Loam', color: '#7a5c3a', minimap: '#8a6a44' },
  { id: 'mud', name: 'Mud', color: '#574028', minimap: '#634a2f' },
  { id: 'rock', name: 'Rock', color: '#8a8a92', minimap: '#9a9aa2' },
  { id: 'coral', name: 'Coral', color: '#e0738f', minimap: '#e88aa2' },
];

// Coral is a refuge: any animal without `coralRefuge` can neither enter coral
// cells nor hunt prey sitting on them. Pure predicate over a terrain type.
export function coralHides(sp, terrainType) {
  return terrainType === TERRAIN.CORAL && !sp.coralRefuge;
}

// Thresholds used to bucket fields into the discrete types above.
export const TERRAIN_THRESHOLDS = {
  deepWater: 0.30,   // elevation below => deep water
  shoreline: 0.42,   // elevation below => shallow water; above => land
  rocky: 0.62,       // rockiness above => rock
  wet: 0.62,         // moisture above => mud
  dry: 0.34,         // moisture below => sand
};

// Classify a (elevation, moisture, rockiness) sample into a TERRAIN type.
export function classifyTerrain(e, m, r) {
  const t = TERRAIN_THRESHOLDS;
  if (e < t.deepWater) return TERRAIN.DEEP_WATER;
  if (e < t.shoreline) return TERRAIN.SHALLOW_WATER;
  if (r > t.rocky) return TERRAIN.ROCK;
  if (m > t.wet) return TERRAIN.MUD;
  if (m < t.dry) return TERRAIN.SAND;
  return TERRAIN.DIRT;
}

// Field distance over which a terrain boundary is rendered as a dithered
// (stippled) transition, like the 90s inspiration game's edges.
export const DITHER_WIDTH = 0.05;

// For a sample near a type boundary, return [primaryType, secondaryType, mix]
// where `mix` (0..0.5) is the fraction of pixels to stipple toward the
// secondary type. Deep inside a region mix is 0 (no dithering).
export function classifyDither(e, m, r) {
  const t = TERRAIN_THRESHOLDS;
  const primary = classifyTerrain(e, m, r);
  let bestDist = DITHER_WIDTH;
  let secondary = primary;
  const consider = (field, val, thr) => {
    const dist = Math.abs(val - thr);
    if (dist >= bestDist) return;
    const nudged = val < thr ? thr + 1e-3 : thr - 1e-3; // just across the line
    const alt = classifyTerrain(
      field === 0 ? nudged : e,
      field === 1 ? nudged : m,
      field === 2 ? nudged : r,
    );
    if (alt !== primary) { bestDist = dist; secondary = alt; }
  };
  consider(0, e, t.deepWater);
  consider(0, e, t.shoreline);
  if (e >= t.shoreline) {            // land-only soil boundaries
    consider(2, r, t.rocky);
    consider(1, m, t.wet);
    consider(1, m, t.dry);
  }
  const mix = secondary === primary ? 0 : (DITHER_WIDTH - bestDist) / (2 * DITHER_WIDTH);
  return [primary, secondary, mix];
}

// --- Species -------------------------------------------------------------
// habitat: tolerance bands per field, [lo, hi]. A field omitted == no
//   constraint. Suitability is the product of per-band membership (1 inside
//   the band, ramping to 0 over HABITAT_SOFTNESS outside it). Suitability
//   gates where an organism can live/spawn and scales animal movement speed.
//
// See README "Balancing" for the meaning of the numeric knobs.
export const SPECIES = [
  // ---- Producers ----
  {
    id: 'qelp', name: 'Qelp', kind: 'plant',
    color: '#2f8f5b',
    habitat: { elevation: [0.30, 0.42] },               // shallow water
    size: 0.7,
    growth: 0.45, maxEnergy: 22, matureAge: 60,
    reproEnergy: 14, reproCost: 9, reproCooldown: 70,
    spreadRadius: 4.5, crowdLimit: 5, biteEnergy: 7,
    wexle: { food: 2, material: 3, value: 1 },
  },
  {
    id: 'naze', name: 'Naze', kind: 'plant',
    color: '#d4c24a',
    habitat: { elevation: [0.42, 0.78], moisture: [0.34, 0.62], rockiness: [0, 0.55] },
    size: 0.7,
    growth: 0.55, maxEnergy: 24, matureAge: 70,                  // hardy regrowth:
    reproEnergy: 14, reproCost: 8, reproCooldown: 60,            // Naze feeds three
    spreadRadius: 5, crowdLimit: 8, biteEnergy: 8,               // grazers
    wexle: { food: 4, material: 1, value: 2 },
  },
  {
    id: 'cacta', name: 'Cacta', kind: 'plant',
    color: '#3f9e6b',
    habitat: { elevation: [0.42, 0.95], moisture: [0, 0.34], rockiness: [0, 0.7] }, // dry
    size: 0.85,
    growth: 0.3, maxEnergy: 28, matureAge: 95,
    reproEnergy: 17, reproCost: 10, reproCooldown: 130,
    spreadRadius: 3.5, crowdLimit: 4, biteEnergy: 9,
    wexle: { food: 3, material: 4, value: 3 },
  },
  {
    id: 'muss', name: 'Muss', kind: 'plant',
    color: '#7fae5c',
    habitat: { elevation: [0.42, 1], rockiness: [0.6, 1] },   // rocky ground cover
    size: 0.5,
    growth: 0.5, maxEnergy: 14, matureAge: 40,
    reproEnergy: 9, reproCost: 5, reproCooldown: 50,
    spreadRadius: 3, crowdLimit: 9, biteEnergy: 5,           // fills in solidly
    wexle: { food: 2, material: 2, value: 1 },
  },
  {
    id: 'mmmapple', name: 'Mmmapple', kind: 'plant',
    color: '#9b5fb0',
    habitat: { elevation: [0.45, 0.78], moisture: [0.4, 0.75], rockiness: [0, 0.5] },
    size: 1.6,                                              // a tree
    growth: 0.5, maxEnergy: 42, matureAge: 220,
    reproEnergy: 26, reproCost: 16, reproCooldown: 230,
    spreadRadius: 13, crowdLimit: 2, biteEnergy: 11,        // helicopter seeds
    wexle: { food: 8, material: 6, value: 6 },
  },
  // ---- Herbivores ----
  {
    id: 'ghoti', name: 'Ghoti', kind: 'animal',
    color: '#5fb6e6',
    habitat: { elevation: [0.30, 0.42] },                   // shallow water
    diet: ['qelp'],
    size: 0.9, speed: 0.16, sense: 6.5,
    metabolism: 0.05, maxEnergy: 42, hungerAt: 0.7, eatGain: 1.0,
    matureAge: 130, reproEnergy: 26, reproCost: 14, reproCooldown: 165,
    crowdRadius: 6, crowdLimit: 6, fleeFactor: 0.8,
    coralRefuge: true,                               // safe from predators in coral
    wexle: { food: 6, material: 2, value: 4 },
  },
  {
    id: 'latt', name: 'Latt', kind: 'animal',
    color: '#c98a4b',
    habitat: { elevation: [0.42, 0.85], rockiness: [0, 0.6] },
    diet: ['naze'],
    size: 0.9, speed: 0.17, sense: 6.5,
    metabolism: 0.05, maxEnergy: 42, hungerAt: 0.7, eatGain: 1.0,
    matureAge: 150, reproEnergy: 28, reproCost: 15, reproCooldown: 210,
    crowdRadius: 6, crowdLimit: 4, fleeFactor: 0.8,
    wexle: { food: 5, material: 3, value: 4 },
  },
  {
    id: 'unclet', name: 'Unclet', kind: 'animal',
    color: '#d9b38c',
    habitat: { elevation: [0.42, 0.98] },                   // roams all land
    diet: ['naze', 'cacta', 'muss', 'mmmapple'],            // generalist grazer
    size: 1.15, speed: 0.16, sense: 7.5,
    metabolism: 0.055, maxEnergy: 52, hungerAt: 0.72, eatGain: 0.9,
    matureAge: 180, reproEnergy: 34, reproCost: 19, reproCooldown: 250,
    crowdRadius: 7, crowdLimit: 3, fleeFactor: 0.6,
    wexle: { food: 7, material: 4, value: 5 },
  },

  // ---- Predators ----
  {
    id: 'daot', name: 'Daot', kind: 'animal',
    color: '#9b78d4',
    habitat: { elevation: [0.30, 0.70] },                   // amphibious
    diet: ['ghoti', 'latt', 'unclet'],                      // generalist predator
    size: 1.3, speed: 0.15, sense: 9,
    metabolism: 0.085, maxEnergy: 80, hungerAt: 0.8, eatGain: 0.55,
    matureAge: 350, reproEnergy: 60, reproCost: 36, reproCooldown: 480,
    crowdRadius: 16, crowdLimit: 1, fleeFactor: 0, lifespan: 2400,
    wexle: { food: 9, material: 5, value: 8 },
  },
  {
    id: 'eagul', name: 'Eagul', kind: 'animal',
    color: '#d6d2c4',
    habitat: { elevation: [0.30, 1] },                      // flies over everything
    diet: ['ghoti', 'naze'],                                // generalist bird
    size: 1.0, speed: 0.22, sense: 10,
    metabolism: 0.062, maxEnergy: 46, hungerAt: 0.72, eatGain: 0.85,
    matureAge: 230, reproEnergy: 36, reproCost: 20, reproCooldown: 360,
    crowdRadius: 13, crowdLimit: 1, fleeFactor: 0, lifespan: 1500, // kept sparse
    wexle: { food: 6, material: 3, value: 6 },
  },
  {
    id: 'qraken', name: 'Qraken', kind: 'animal',
    color: '#6b3f8f',
    habitat: { elevation: [0, 0.42] },                      // bound to water
    diet: ['ghoti', 'daot'],                                // apex (water reach)
    size: 2.2, speed: 0.14, sense: 12,
    metabolism: 0.07, maxEnergy: 120, hungerAt: 0.82, eatGain: 0.5,
    matureAge: 520, reproEnergy: 92, reproCost: 56, reproCooldown: 720,
    crowdRadius: 26, crowdLimit: 1, fleeFactor: 0, lifespan: 3600,
    wexle: { food: 12, material: 8, value: 14 },
  },
];

// --- World / simulation --------------------------------------------------
export const CONFIG = {
  world: {
    width: 240,
    height: 176,
    seed: 1337,
    noiseScale: 0.05,    // smaller => bigger landmasses/regions
    coralScale: 0.10,    // coral patch noise frequency
    coralThreshold: 0.56, // higher => less coral; fraction of water that's reef
  },

  sim: {
    ticksPerSecond: 30,
    maxEntities: 90000,
    cellPx: 1,
  },

  initial: {
    qelp: 1400, naze: 1800, cacta: 500, muss: 700, mmmapple: 180,
    ghoti: 300, latt: 220, unclet: 120,
    daot: 22, eagul: 45, qraken: 8,
  },

  graph: {
    historyLength: 600,
    sampleEvery: 10,
  },
};

// --- Derived lookups -----------------------------------------------------
// Bitmasks cap at 31 species (we use `1 << index`). Plenty for this game.
export const MAX_SPECIES = 31;
export const SPECIES_INDEX = {};

// (Re)compute everything derived from the SPECIES table: indices, diet/predator
// bitmasks, and habitat band lists. Safe to call again after editing or adding
// a species (e.g. from the dev tools).
export function rebuildDerivedSpecies() {
  for (const k of Object.keys(SPECIES_INDEX)) delete SPECIES_INDEX[k];
  SPECIES.forEach((s, i) => { SPECIES_INDEX[s.id] = i; });

  SPECIES.forEach((s, i) => {
    s.index = i;
    s.dietMask = 0;
    (s.diet || []).forEach(id => {
      if (id in SPECIES_INDEX) s.dietMask |= (1 << SPECIES_INDEX[id]);
    });
    s.bands = [];
    const h = s.habitat || {};
    if (h.elevation) s.bands.push({ field: FIELD.ELEVATION, lo: h.elevation[0], hi: h.elevation[1] });
    if (h.moisture) s.bands.push({ field: FIELD.MOISTURE, lo: h.moisture[0], hi: h.moisture[1] });
    if (h.rockiness) s.bands.push({ field: FIELD.ROCKINESS, lo: h.rockiness[0], hi: h.rockiness[1] });
  });
  SPECIES.forEach((s, i) => {
    s.predatorMask = 0;
    SPECIES.forEach((other, j) => {
      if (other.dietMask & (1 << i)) s.predatorMask |= (1 << j);
    });
  });
}
rebuildDerivedSpecies();

// Append a new species (dev tools). `def` is a partial species object; sane
// defaults fill the rest. Returns the created species (or throws if full / dup).
export function createSpecies(def) {
  if (SPECIES.length >= MAX_SPECIES) throw new Error('species limit reached');
  const id = def.id || def.name.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (id in SPECIES_INDEX) throw new Error(`species "${id}" already exists`);
  const isPlant = def.kind === 'plant';
  const base = isPlant
    ? { growth: 0.4, maxEnergy: 22, matureAge: 70, reproEnergy: 14, reproCost: 9,
        reproCooldown: 80, spreadRadius: 4, crowdLimit: 5, biteEnergy: 7 }
    : { speed: 0.16, sense: 7, metabolism: 0.05, maxEnergy: 45, hungerAt: 0.7,
        eatGain: 0.9, matureAge: 150, reproEnergy: 28, reproCost: 16,
        reproCooldown: 200, crowdRadius: 6, crowdLimit: 4, fleeFactor: 0.6 };
  const sp = {
    ...base,
    ...def,
    id,
    name: def.name || id,
    kind: def.kind || 'animal',
    color: def.color || '#cccccc',
    habitat: def.habitat || (isPlant ? { elevation: [0.30, 0.42] } : { elevation: [0.42, 0.98] }),
    size: def.size ?? (isPlant ? 0.7 : 1.0),
    diet: def.diet || [],
    wexle: def.wexle || { food: 3, material: 3, value: 3 },
  };
  delete sp.initial; // a dev-form field, not a species attribute
  SPECIES.push(sp);
  CONFIG.initial[id] = def.initial ?? (isPlant ? 400 : 80);
  rebuildDerivedSpecies();
  return sp;
}

// Largest radius any organism cares about — sizes the spatial grid buckets.
export const MAX_INTERACTION_RADIUS = Math.max(
  ...SPECIES.map(s => Math.max(s.sense || 0, s.spreadRadius || 0, 2))
);

// Kept for any external reference; prefer SPECIES.length for live counts.
export const NUM_SPECIES = SPECIES.length;

// Minimum suitability for an organism to occupy a cell at all (below this the
// terrain is effectively impassable / uninhabitable for it).
export const MIN_HABITABLE = 0.05;
