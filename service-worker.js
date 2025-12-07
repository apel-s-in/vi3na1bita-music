// sw.js
const CACHE_NAME = 'vitrina-v8.0.3';
const RUNTIME_CACHE = 'vitrina-runtime-v8.0.3';

const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './styles/main.css',
  './img/logo.png',
  './img/star.png',
  './img/star2.png',
  './icons/favicon-32.png',
  './icons/apple-touch-icon.png',
  
  // Scripts
  './scripts/core/bootstrap.js',
  './scripts/core/config.js',
  './scripts/ui/notify.js',
  './scripts/ui/favorites.js',
  './scripts/ui/sleep.js',
  './scripts/ui/lyrics-modal.js',
  './scripts/app/background-audio.js',
  './scripts/app/player-ui.js',
  './scripts/app/albums.js',
  './scripts/app.js',
  './src/PlayerCore.js',
  
  // Howler.js
  'https://cdn.jsdelivr.net/npm/howler@2.2.4/dist/howler.min.js'
];

// Установка
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Активация
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName !== RUNTIME_CACHE) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Аудио файлы - прямой запрос
  if (request.url.includes('.mp3') || request.url.includes('.ogg')) {
    event.respondWith(fetch(request));
    return;
  }

  // Стратегия Cache First для статики
  if (STATIC_ASSETS.some(asset => request.url.includes(asset))) {
    event.respondWith(
      caches.match(request).then((response) => {
        return response || fetch(request).then((fetchResponse) => {
          return caches.open(RUNTIME_CACHE).then((cache) => {
            cache.put(request, fetchResponse.clone());
            return fetchResponse;
          });
        });
      })
    );
    return;
  }

  // Network First для остального
  event.respondWith(
    fetch(request).then((response) => {
      return caches.open(RUNTIME_CACHE).then((cache) => {
        cache.put(request, response.clone());
        return response;
      });
    }).catch(() => {
      return caches.match(request);
    })
  );
});
