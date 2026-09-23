// Offline-Cache für die Home-Bildschirm-App: nach dem ersten Öffnen läuft alles ohne Internet.
const CACHE = 'fortnite-temu-v5';
const FILES = ['./', './index.html', './manifest.webmanifest', './icon-180.png', './icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// Erst Cache (schnell + offline), im Hintergrund aktualisieren
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.open(CACHE).then(async (cache) => {
    const cached = await cache.match(e.request, { ignoreSearch: true });
    const net = fetch(e.request).then((res) => { if (res && res.ok) cache.put(e.request, res.clone()); return res; }).catch(() => cached);
    return cached || net;
  }));
});
