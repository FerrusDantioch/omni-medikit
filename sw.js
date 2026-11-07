'use strict';

const VERSION = '1.1.0';
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
  'icons/favicon.ico',
  'icons/icon-192.png',
  'icons/icon-384.png',
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
