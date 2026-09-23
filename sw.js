// Minimal offline cache for the PWA. Bump CACHE when assets change.
const CACHE = 'vibe-ecology-v9';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './manifest.webmanifest',
  './icons/icon.svg',
  './src/main.js',
  './src/config.js',
  './src/world.js',
  './src/spatial.js',
  './src/entities.js',
  './src/simulation.js',
  './src/harvest.js',
  './src/colony.js',
  './src/foodweb.js',
  './src/camera.js',
  './src/input.js',
  './src/renderer.js',
  './src/textures.js',
  './src/graphs.js',
  './src/score.js',
  './src/ui.js',
  './src/dev.js',
  './src/sprites/paint.js',
  './src/sprites/critters.js',
  './src/sprites/atlas.js',
  './src/sprites/colony_scene.js',
  './src/terrain/art.js',
  './src/terrain/tiles.js',
  './src/terrain/worker.js',
  './sprites.html',
  './src/gallery.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request))
  );
});
