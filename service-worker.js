const SW_VERSION = '9.0.0'; // Обновил версию, чтобы сбросить старый кэш
const CORE_CACHE = `vitrina-core-v${SW_VERSION}`;
const RUNTIME_CACHE = `vitrina-runtime-v${SW_VERSION}`;
const OFFLINE_CACHE = `vitrina-offline-v${SW_VERSION}`;

// Только существующие файлы!
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './styles/main.css',
  './albums.json', // Конфиг теперь здесь
  
  // Изображения
  './img/logo.png',
  './img/star.png',
  './icons/favicon-32.png',
  './icons/apple-touch-icon.png',

  // Новые скрипты (Ядро)
  './scripts/main.js',
  './scripts/core/utils.js',
  './scripts/core/track-registry.js',
  './scripts/core/favorites-store.js',
  './scripts/core/player-core.js',
  './scripts/core/ui-kit.js',
  
  // Приложение
  './scripts/app/app-controller.js',
  './scripts/app/lyrics-engine.js',
  
  // UI
  './scripts/ui/track-list-renderer.js',
  './scripts/ui/offline-modal.js',
  
  // Offline (сложная часть)
  './scripts/offline/offline-manager.js',
  './scripts/offline/cache-db.js',
  './scripts/offline/net-policy.js',
  './scripts/offline/playback-cache.js',
  './scripts/offline/track-resolver.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CORE_CACHE)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names.map((name) => {
          if (name !== CORE_CACHE && name !== RUNTIME_CACHE && name !== OFFLINE_CACHE) {
            return caches.delete(name);
          }
        })
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Аудио стримим (Range requests), не кэшируем в Core
  if (/\.(mp3|ogg|m4a)$/i.test(url.pathname)) {
    return; 
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      
      return fetch(event.request).then((resp) => {
        // Кэшируем новые ресурсы в Runtime
        if (!resp || resp.status !== 200 || resp.type !== 'basic') return resp;
        const responseToCache = resp.clone();
        caches.open(RUNTIME_CACHE).then((cache) => {
          cache.put(event.request, responseToCache);
        });
        return resp;
      });
    })
  );
});
