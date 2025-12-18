const CACHE_NAME = 'k-pvprosim-v1.1';
const ASSETS = [
  './',
  './index.html',
  './index.tsx',
  './manifest.json',
  './sw.js'
];

self.addEventListener('install', (event) => {
  // Força o Service Worker a tornar-se ativo imediatamente
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});

self.addEventListener('activate', (event) => {
  // Permite que o SW tome o controlo das páginas abertas imediatamente
  event.waitUntil(self.clients.claim());
  
  // Limpeza de caches antigas
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      // Retorna do cache se existir, senão faz fetch na rede
      return response || fetch(event.request);
    })
  );
});