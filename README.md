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
| **Daot** (toad) | animal | water + land (amphibious) | Ghoti, Latt |
| **Eagul** (bird) | animal | everywhere (flies) | Ghoti, Naze |
| **Qraken** (squid) | animal | water (apex) | Ghoti, Daot |

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
- Bottom-right buttons: **harvesting menu** (🧺), **play/pause**, **speed**
  (1/2/4/8×), **toggle graph**, **regenerate world**.

### Harvesting

The 🧺 button opens the harvesting menu. Per species, the Wexles can harvest
**None / Some / A Lot / As Needed** — "As Needed" scales with colony size, so
it ramps up as the colony grows. Harvested organisms leave the ecosystem and
their food/material/value accumulate as colony resources. Over-harvest and you
can crash a population — that's the tension. (The colony that consumes these
resources is still to come; see issue #10.)

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
  camera.js                 world<->screen, pan/zoom, clamping
  input.js                  touch + mouse gestures
  renderer.js               terrain blit + culled, batched entity draw
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
- Rendering pre-bakes terrain to an offscreen canvas (one scaled blit) and
  draws only on-screen entities, batched by species.

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
