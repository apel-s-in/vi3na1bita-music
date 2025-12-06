// sw.js
// Service Worker для PWA и офлайн-работы

const CACHE_NAME = 'vitrina-razbita-v1.0.0';
const RUNTIME_CACHE = 'vitrina-runtime-v1';

// Статичные ресурсы для кэширования
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './styles/main.css',
  
  // Scripts (core)
  './scripts/core/bootstrap.js',
  './scripts/core/config.js',
  
  // Scripts (player)
  './scripts/player/PlayerCore.js',
  './scripts/player/player-adapter.js',
  
  // Scripts (ui)
  './scripts/ui/notify.js',
  './scripts/ui/favorites.js',
  './scripts/ui/favorites-const.js',
  './scripts/ui/favorites-storage.js',
  './scripts/ui/favorites-data.js',
  './scripts/ui/mini.js',
  './scripts/ui/sysinfo.js',
  
  // Scripts (app)
  './scripts/app/albums.js',
  './scripts/app/navigation.js',
  './scripts/app/downloads.js',
  './scripts/app/player-controls.js',
  './scripts/app/background-audio.js',
  './scripts/app/background-events.js',
  
  // Main
  './scripts/app.js',
  
  // Icons
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  
  // Images
  './img/logo.png',
  './img/icon_album/icon-album-00.png',
  './img/icon_album/icon-album-news.png'
];

// Установка Service Worker
self.addEventListener('install', (event) => {
  console.log('[SW] Installing...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => {
        console.log('[SW] Installed successfully');
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('[SW] Installation failed:', error);
      })
  );
});

// Активация Service Worker
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...');
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        // Удалить старые кэши
        return Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME && name !== RUNTIME_CACHE)
            .map((name) => {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => {
        console.log('[SW] Activated successfully');
        return self.clients.claim();
      })
  );
});

// Обработка запросов
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Игнорировать chrome-extension и другие протоколы
  if (!url.protocol.startsWith('http')) {
    return;
  }

  // Игнорировать внешние CDN (Howler.js)
  if (url.hostname === 'cdn.jsdelivr.net') {
    event.respondWith(fetch(request));
    return;
  }

  // Стратегия для аудио файлов: Network First
  if (request.url.endsWith('.mp3')) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Стратегия для статичных ресурсов: Cache First
  event.respondWith(cacheFirst(request));
});

// Стратегия: Cache First
async function cacheFirst(request) {
  try {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    
    if (cached) {
      console.log('[SW] Serving from cache:', request.url);
      return cached;
    }
    
    console.log('[SW] Fetching from network:', request.url);
    const response = await fetch(request);
    
    // Кэшировать успешные GET-запросы
    if (response.ok && request.method === 'GET') {
      cache.put(request, response.clone());
    }
    
    return response;
    
  } catch (error) {
    console.error('[SW] Cache First error:', error);
    
    // Вернуть офлайн-страницу или базовый fallback
    return new Response('Offline', {
      status: 503,
      statusText: 'Service Unavailable',
      headers: new Headers({ 'Content-Type': 'text/plain' })
    });
  }
}

// Стратегия: Network First (для аудио)
async function networkFirst(request) {
  try {
    console.log('[SW] Fetching audio from network:', request.url);
    const response = await fetch(request);
    
    if (response.ok) {
      // Опционально: кэшировать аудио файлы
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, response.clone());
    }
    
    return response;
    
  } catch (error) {
    console.log('[SW] Network failed, trying cache:', request.url);
    
    const cache = await caches.open(RUNTIME_CACHE);
    const cached = await cache.match(request);
    
    if (cached) {
      console.log('[SW] Serving audio from cache');
      return cached;
    }
    
    throw error;
  }
}

// Обработка сообщений от клиентов
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then((names) => {
        return Promise.all(names.map((name) => caches.delete(name)));
      })
    );
  }
});

console.log('[SW] Service Worker loaded');
