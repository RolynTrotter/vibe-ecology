# Vibe Ecology

A cute, top-down ecosystem simulator — loosely inspired by *Gungan Frontier*.
You're seeding life on a fresh world for an alien civilization (the **Wexles**).
For now it's the **ecosystem sandbox**: terrain, organisms, a living food web,
graphs, and an ecosystem-health score. The Wexle colony/harvest layer comes
later.

## The world (first slice)

Two terrains and a five-species food web:

| Organism | Kind | Lives in | Eats |
|----------|------|----------|------|
| **Qelp** (kelp) | plant | shallow water | — (photosynthesis) |
| **Naze** (corn) | plant | dirt | — (photosynthesis) |
| **Ghoti** (fish) | animal | shallow water | Qelp |
| **Latt** (rat) | animal | dirt | Naze |
| **Daot** (toad) | animal | dirt + water (amphibious) | Ghoti, Latt |

Every organism is an **individual agent** that wanders, gets hungry, forages,
flees predators, and reproduces.

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
  config.js                 ALL tunables: terrain, species, world, sim
  world.js                  terrain grid + procedural map (value noise)
  entities.js               Structure-of-Arrays entity store + free list
  spatial.js                uniform-grid spatial index (counting sort)
  simulation.js             one tick of ecology (forage/eat/flee/reproduce)
  camera.js                 world<->screen, pan/zoom, clamping
  input.js                  touch + mouse gestures
  renderer.js               terrain blit + culled, batched entity draw
  graphs.js                 rolling population chart
  score.js                  ecosystem-health metric
  ui.js                     HUD + controls
  main.js                   fixed-timestep loop, wiring
sw.js                       offline cache (PWA)
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
extinction. The key stabilizer here is **density-dependent reproduction**: an
organism won't reproduce if too many of its own species are already nearby
(`crowdRadius` / `crowdLimit` in `config.js`), which imposes a local carrying
capacity and damps the boom/bust cycle. All the knobs live in `config.js` and
are commented — tweak and re-run `trace.mjs` to see the effect.

## Roadmap

- More terrains (sand, mud, rock, deep water) and more species/layers.
- Symbiotic relationships.
- The **Wexle colony**: harvest sliders per species, city growth, scoring that
  blends ecosystem health with colony size.
