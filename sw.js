// Bump this string to force cache updates when assets change
const CACHE = 'ckd-kids-v2';
const ASSETS = [
  '.',
  'index.html',
  'manifest.json',
  'js/app.js',
  'js/ui.js',
  'js/data.js',
  '/images/icon-192.png',
  '/images/icon-512.png',
  '/images/no-image.svg',
  '/images/no-image.jpg',
  '/images/rice.jpg'
];

self.addEventListener('install', (e) => {
  // Populate cache, but do NOT self.skipWaiting() here.
  // Allow the new worker to enter 'waiting' so the page can request activation
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
});

self.addEventListener('activate', (e) => {
  // Remove old caches
  e.waitUntil(
    caches.keys().then(names => Promise.all(
      names.map(n => { if (n !== CACHE) return caches.delete(n); return null; })
    )).then(() => self.clients.claim())
  );
});

// Support skipWaiting via postMessage from the page
self.addEventListener('message', (event) => {
  if(event.data && event.data.type === 'SKIP_WAITING'){
    self.skipWaiting();
  }
});

// Simple cache-first for known assets, network fallback otherwise
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.origin === location.origin) {
    e.respondWith(
      caches.match(e.request).then(resp => {
        if (resp) return resp;
        return fetch(e.request).then(r => {
          // put copy into cache for future
          if (e.request.method === 'GET' && r && r.status === 200) {
            caches.open(CACHE).then(c => c.put(e.request, r.clone()));
          }
          return r;
        }).catch(()=> caches.match('/images/no-image.jpg'));
      })
    );
  }
});
