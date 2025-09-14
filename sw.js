const CACHE = 'ckd-kids-v1';
const ASSETS = [
  '.',
  'index.html',
  'manifest.json',
  'images/no-image.svg'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim());
});

// Simple cache-first for known assets, network fallback otherwise
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.origin === location.origin) {
  e.respondWith(caches.match(e.request).then(resp => resp || fetch(e.request).then(r => {
      // put copy into cache for future
      if (e.request.method === 'GET') caches.open(CACHE).then(c => c.put(e.request, r.clone()));
      return r;
  }).catch(()=> caches.match('images/no-image.svg'))));
  }
});
