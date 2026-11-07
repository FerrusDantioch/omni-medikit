'use strict';

const VERSION = '1.0.1';
const CACHE = 'omni-medikit-' + VERSION;
const PREFIX = 'omni-medikit-';
const COQUILLE = [
  './',
  'index.html',
  'manifest.json',
  'css/style.css',
  'js/db.js',
  'js/logique.js',
  'js/app.js',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      cache.addAll(COQUILLE.map((f) => new Request(f, { cache: 'reload' })))
    )
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cles) => Promise.all(
        cles.filter((c) => c.startsWith(PREFIX) && c !== CACHE).map((c) => caches.delete(c))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'activer') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  if (req.mode === 'navigate') {
    event.respondWith(
      caches.match('index.html').then((hit) => hit || fetch(req).then((rep) => {
        const copie = rep.clone();
        caches.open(CACHE).then((cache) => cache.put('index.html', copie));
        return rep;
      }).catch(() => caches.match('index.html')))
    );
    return;
  }

  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((rep) => {
        if (rep && rep.ok && (req.url.startsWith(self.location.origin) ||
            req.url.startsWith('https://fonts.googleapis.com') ||
            req.url.startsWith('https://fonts.gstatic.com'))) {
          const copie = rep.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copie));
        }
        return rep;
      }).catch(() => caches.match(req));
    })
  );
});
