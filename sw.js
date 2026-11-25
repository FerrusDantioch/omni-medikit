'use strict';

const VERSION = '1.3.0';
const CACHE = 'omni-medikit-' + VERSION;
const PREFIX = 'omni-medikit-';
const COQUILLE = [
  './',
  'index.html',
  'manifest.json',
  'css/style.css',
  'js/theme-init.js',
  'js/db.js',
  'js/logique.js',
  'js/app.js',
  'js/vendor/qrcode.min.js',
  'icons/icon.svg',
  'icons/favicon.ico',
  'icons/icon-192.png',
  'icons/icon-384.png',
  'icons/icon-512.png',
  'icons/icon-maskable-192.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png'
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
  if (event.data && event.data.type === 'demander-fichier' && fichierEnAttente && event.source) {
    event.source.postMessage({ type: 'fichier-json', name: fichierEnAttente.name, texte: fichierEnAttente.texte });
    fichierEnAttente = null;
  }
});

let fichierEnAttente = null;

if ('launchQueue' in self) {
  self.launchQueue.setConsumer((params) => {
    if (!params.files || !params.files.length) return;
    const handle = params.files[0];
    handle.getFile()
      .then((file) => file.text())
      .then((texte) => {
        fichierEnAttente = { name: handle.name || 'import.json', texte: texte };
        return self.clients.matchAll({ type: 'window' });
      })
      .then((clients) => {
        for (const client of clients) {
          client.postMessage({ type: 'fichier-json', name: fichierEnAttente.name, texte: fichierEnAttente.texte });
        }
      })
      .catch(() => {});
  });
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      if (clients.length > 0) return clients[0].focus();
      return self.clients.openWindow('./');
    })
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const exact = await cache.match(req);
    if (exact) return exact;

    if (req.mode !== 'navigate') {
      const sansQuery = await cache.match(req, { ignoreSearch: true });
      if (sansQuery) return sansQuery;
    }

    try {
      const rep = await fetch(req);
      if (rep && rep.ok) {
        await cache.put(req, rep.clone()).catch(() => {});
      }
      return rep;
    } catch {
      if (req.mode === 'navigate') {
        const fallback = await cache.match('index.html');
        if (fallback) return fallback;
      }
      return new Response('Ressource indisponible hors ligne.', {
        status: 503,
        statusText: 'Service Unavailable',
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    }
  })());
});
