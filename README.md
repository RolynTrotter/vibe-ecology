# Vibe Ecology

A cute, top-down ecosystem simulator — loosely inspired by *Gungan Frontier*.
You're seeding life on a fresh world for an alien civilization (the **Wexles**).
It's the **ecosystem sandbox**: terrain, organisms, a living food web, graphs,
an ecosystem-health score, and harvesting for the Wexles. The colony that
consumes those harvests is still to come.

## The world

Terrain is generated as continuous **fields** (elevation, moisture, rockiness)
from which six discrete types are derived for display — **deep water, shallow
water, sand, loam, mud, rock** — with dithered (stippled) edges between them.
Each species' habitat is a set of **tolerance bands** over those fields:
suitability gates where it can live and reproduce, and scales animal movement
speed (an animal slows as it strays off its preferred ground).

The food web:

| Organism | Kind | Lives in | Eats |
|----------|------|----------|------|
| **Qelp** (kelp) | plant | shallow water | — |
| **Qorl** (coral) | plant | deep water | — |
| **Naze** (corn) | plant | loam | — |
| **Cacta** (cactus) | plant | sand (dry) | — |
| **Muss** (lichen) | plant | rock (ground cover) | — |
| **Mmmapple** (tree) | plant | loam (long-range seeds) | — |
| **Ghoti** (fish) | animal | shallow water | Qelp |
| **Latt** (rat) | animal | loam | Naze |
| **Unclet** (goat) | animal | all land (generalist) | Naze, Cacta, Muss, Mmmapple |
| **Dinsopu** (toad) | animal | water + land (amphibious) | Ghoti, Latt |
| **Eagul** (bird) | animal | everywhere (flies) | Ghoti, Naze |
| **Qraken** (squid) | animal | water (apex) | Ghoti, Dinsopu |

Every organism is an **individual agent** that wanders, gets hungry, forages,
flees predators, and reproduces.

Some flavor mechanics are intentionally **deferred** (tracked in issues):
Eagul nesting in Mmmapple trees, Qraken's inland tentacle reach, treating Qorl
reefs / forests as terrain features, and Muss rendering as a solid ground
texture.

## Running it

It's a zero-build static web app (ES modules), so you just need to serve the
folder over HTTP (ES modules won't load from `file://`).

```bash
python3 tools/serve.py        # serves on :8000, prints a LAN URL for your phone
```

Open the printed `http://localhost:8000` on your computer, or the
`http://<lan-ip>:8000` URL on an Android phone on the same Wi-Fi. On the phone
you can "Add to Home Screen" to install it as a fullscreen PWA (works offline
after first load via the service worker).

### Controls

- **One finger drag** — pan the camera.
- **Pinch** — zoom (mouse wheel on desktop).
- **Minimap** (top-right) — tap/drag to jump the camera.
- **Bottom-left**: **play/pause** and **speed** (1/2/4/8×).
- **Bottom-right**: **Map display** (🗺), **Statistics** (📊), **Wexles** (🧺),
  **Dev tools** (🛠), **regenerate world** (⟳).

### Map display (🗺)

The ground is painted in the same sticker style as the critters. It is baked
from the world's *continuous* fields rather than its cell grid, so shorelines
and soil edges stay smooth and crisp at every zoom.

- **Water**: deep-to-shallow shading, rippling light, an inked shoreline with
  white foam, and sun glints that twinkle when you zoom in.
- **Land**: loam with mossy patches, rippled sand, glossy mud puddles, and
  gentle hill shading.
- **Rock and reef**: rock plateaus have cracked plates, an inked rim and a drop
  shadow. Coral reefs are candy-coloured heads with polyps, and fish swimming
  over a reef show through it faintly.
- **Close-up details**: grass tufts, flowers, glowing buds, shells, starfish,
  pebbles, reeds, lily pads and glowing crystals.
- **Tiles**: like a maps app, the view sharpens progressively as you zoom. Tiles
  bake in background Web Workers and never leave holes on screen.
- **Frame**: the world floats as an inked card in space, and the minimap uses
  the painted map.

The Map menu switches what's drawn:
- **View**: Terrain, or a colour-ramped map of **Elevation / Moisture /
  Rockiness** (the underlying fields).
- **Show life**: Both / Plants / Animals / None (by kind, not per species).

### Critters & plants (sprites)

Every organism is drawn as a cutesy sci-fi **sticker sprite**: glowing-tailed
Latts, moustached Unclets, angler-lure Ghoti, hopping moon-toad Dinsopu,
plume-crested Eaguls, glow-spotted Qraken, cyan-eyed Necrows, bead-cob Naze,
sleepy Cacta, glowing-mushroom Muss, and smiling-fruit Mmmapple trees.
They walk, swim, hop, flap and sway, with babies, corpses, and grazed or
fruitless plants all looking different.

- Sprites are **procedural**: each species is a small draw function
  (`src/sprites/critters.js`) that gets baked at load into mipmapped sprite
  sheets. No image files, sharp at any zoom, and easy to tweak.
- **Zoom LOD**: fully zoomed out, life is flat colour dots. As you zoom in they
  become outline-free colour blobs, then crossfade into inked, animated
  stickers. Far-zoom plants are baked into one cached layer so zooming out
  stays cheap.
- Walk cycles follow how far a critter actually moved, so a chase looks
  frantic and a paused world idles and breathes. Fliers cast a shadow on
  the ground below them.
- Open **`sprites.html`** for the sprite gallery: every pose animating on
  its home terrain, the full zoom/mip ladder, and the colony scene with a
  population slider.

### Dev tools (🛠)

For balancing/development — tweaks apply to the running sim:
- **Global** — tick rate (live), and world noise/coral/seed with a Regenerate.
- **Species** — pick a species and drag sliders for its attributes (speed,
  metabolism, reproduction, habitat crowding, harvest values, …); changes take
  effect immediately. "Spawn +N" injects individuals into the live world.
- **Create** — define a new species (name, color, kind, habitat preset, diet)
  and add it; the world restarts so it seeds in. Capped at 31 species.

### Statistics (📊)

A tabbed read-out, closed by default to keep the screen clean:
- **Species** — live population per species.
- **Over time** — the rolling population graph (√-scaled).
- **Food web** — a reference diagram of who-eats-whom, derived from diets.
- **Terrain** — % coverage of each terrain type.

### Wexles: Harvesting & Colony (🧺)

- **Harvest** tab — per species, set **None / Some / A Lot / As Needed**.
  "As Needed" scales with the colony's size. Harvested organisms leave the
  ecosystem; their food/material/value feed the colony. Over-harvest and a
  species can crash — that's the tension.
- **Colony** tab — the Wexle city. It eats harvested **food** to grow its
  population (and shrinks if starved), unlocking buildings as it grows. The
  colony's population is the real `colonySize` that "As Needed" scales with,
  closing the loop. It's drawn as a coastal lagoon town, shown as a cutaway at
  the waterline. The landing pod and a raft workshop float on the swell; the
  hatchery and Grand Dome sit on the seabed; the granary and spire stand on
  stilts through the surface. Buildings rise as they unlock and the next one
  glows as a hologram blueprint. One Wexle per citizen either strolls the
  dock and islet or swims below in a fishbowl helmet. The economy is still early (issue #10).

## Architecture

Client-side JS for the live loop; Python is reserved for tooling/balancing.

```
index.html / style.css      shell + mobile-first HUD
src/
  config.js                 ALL tunables: terrain, species, habitat, sim
  world.js                  continuous fields + derived types + suitability
  entities.js               Structure-of-Arrays entity store + free list
  spatial.js                uniform-grid spatial index (counting sort)
  simulation.js             one tick of ecology (forage/eat/flee/reproduce)
  harvest.js                per-species harvesting + resource tally
  colony.js                 Wexle city: grows on food, unlocks buildings
  foodweb.js                trophic structure derived from diets
  camera.js                 world<->screen, pan/zoom, clamping
  input.js                  touch + mouse gestures
  renderer.js               baked map layers + culled, y-sorted sprite draw
  sprites/
    paint.js                kawaii sticker kit: cel shading, ink, eyes, glows
    critters.js             one sprite per species (+ fallbacks for new ones)
    atlas.js                lazy mipmapped sprite sheets, LOD, menu icons
    colony_scene.js         the illustrated Wexle town (Colony tab)
  gallery.js                sprite gallery (sprites.html)
  terrain/
    art.js                  per-pixel terrain painter + scattered decorations
    tiles.js                zoom-level tile pyramid, LRU cache, fallbacks
    worker.js               off-main-thread tile baking (OffscreenCanvas)
  textures.js               field color ramps (analysis views)
  graphs.js                 rolling population chart
  score.js                  ecosystem-health metric
  ui.js                     HUD + controls
  main.js                   fixed-timestep loop, wiring
sw.js                       offline cache (PWA)
tests/                      unit tests + tiny harness (npm test)
tools/
  serve.py                  local/LAN dev server
  smoke_test.mjs            headless correctness check
  trace.mjs                 population-trajectory printout
```

### Performance notes

The sim is built to scale to the "quite large" end:

- **Structure-of-Arrays** typed-array storage with a free list — no per-entity
  objects, no GC churn during the sim.
- A **counting-sort spatial grid** rebuilt each tick gives O(1)-ish neighbour
  queries for foraging/flee/crowding, with no per-frame allocation.
- Terrain tiles are baked in Web Workers at the zoom level the view needs,
  choosing the level so tiles are only ever scaled up. When the world fills
  the screen, the backdrop and frame aren't drawn at all. Rendering draws only
  on-screen entities. Each entity is a single `drawImage` from a
  per-species sprite sheet, picked to upscale slightly rather than downscale,
  because a software canvas downscales far more slowly. Tiny species batch
  into dot paths, and far-zoom plants come from a world-space cache that
  refreshes a slice per frame.

Run the checks:

```bash
npm test                      # unit tests (tests/*.test.mjs)
node tools/smoke_test.mjs     # asserts sim consistency over 3000 ticks
node tools/trace.mjs 20000    # prints the population trajectory
```

## Balancing

Predator/prey systems naturally oscillate, and naïve parameters diverge into
extinction. Three stabilizers keep this web alive over long runs:

- **Density-dependent reproduction** — an organism won't reproduce if too many
  of its own species are nearby (`crowdRadius` / `crowdLimit`), imposing a
  local carrying capacity that damps boom/bust.
- **Senescence** — animals with a `lifespan` die off with rising probability
  past it. This caps long-lived predators that would otherwise slowly ratchet
  up and grind their prey to extinction.
- **Food-web balance** — a species eaten by several others (e.g. Naze, grazed
  by Latt, Unclet, and Eagul) needs proportionally hardier regrowth, and an
  unpredated herbivore will sit at carrying capacity overgrazing everything, so
  it wants a predator. Watch for these gaps when adding species.

All the knobs live in `config.js` and are commented — tweak and re-run
`node tools/trace.mjs 12000` to see the effect on the whole web.

## Roadmap

- Deferred flavor mechanics: Eagul nesting, Qraken inland reach, reef/forest
  terrain features, ground-cover textures.
- Symbiotic relationships.
- The **Wexle colony**: city growth that consumes harvested resources, and a
  combined score blending ecosystem health with colony size.
