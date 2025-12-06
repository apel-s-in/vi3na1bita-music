// service-worker.js
// Оптимизированный Service Worker с умным кэшированием

const CACHE_VERSION = 'v8.1.0';
const CACHE_PREFIX = 'vitrina-razbita';

const CACHES = {
  static: `${CACHE_PREFIX}-static-${CACHE_VERSION}`,
  dynamic: `${CACHE_PREFIX}-dynamic-${CACHE_VERSION}`,
  audio: `${CACHE_PREFIX}-audio-${CACHE_VERSION}`,
  images: `${CACHE_PREFIX}-images-${CACHE_VERSION}`
};

// Критические ресурсы для предварительного кэширования
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/styles/main.css',
  
  // Core scripts
  '/scripts/core/bootstrap.js',
  '/scripts/core/config.js',
  
  // Player
  '/scripts/player/player-adapter.js',
  
  // UI
  '/scripts/ui/notify.js',
  '/scripts/ui/favorites-const.js',
  '/scripts/ui/favorites-storage.js',
  '/scripts/ui/favorites-data.js',
  '/scripts/ui/favorites.js',
  '/scripts/ui/mini.js',
  '/scripts/ui/sysinfo.js',
  
  // App modules
  '/scripts/app/background-audio.js',
  '/scripts/app/background-events.js',
  '/scripts/app/player-controls.js',
  '/scripts/app/albums.js',
  '/scripts/app/navigation.js',
  '/scripts/app/downloads.js',
  '/scripts/app.js',
  
  // Performance
  '/performance/rum.js',
  
  // Images
  '/img/logo.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/favicon-32.png',
  
  // Album icons
  '/img/icon_album/icon-album-00.png',
  '/img/icon_album/icon-album-01.png',
  '/img/icon_album/icon-album-02.png',
  '/img/icon_album/icon-album+00.png',
  '/img/icon_album/icon-album-news.png',
  
  // External dependencies
  'https://cdn.jsdelivr.net/npm/howler@2.2.4/dist/howler.core.min.js'
];

// Стратегии кэширования
const CACHE_STRATEGIES = {
  // Сначала кэш, затем сеть (для статики)
  cacheFirst: async (request, cacheName) => {
    const cached = await caches.match(request);
    if (cached) {
      return cached;
    }
    
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  },
  
  // Сначала сеть, затем кэш (для динамики)
  networkFirst: async (request, cacheName) => {
    try {
      const response = await fetch(request);
      if (response.ok) {
        const cache = await caches.open(cacheName);
        cache.put(request, response.clone());
      }
      return response;
    } catch (error) {
      const cached = await caches.match(request);
      if (cached) {
        return cached;
      }
      throw error;
    }
  },
  
  // Только сеть (для API)
  networkOnly: async (request) => {
    return fetch(request);
  },
  
  // Только кэш
  cacheOnly: async (request) => {
    return caches.match(request);
  }
};

// Установка Service Worker
self.addEventListener('install', (event) => {
  console.log('[SW] Installing...', CACHE_VERSION);
  
  event.waitUntil(
    caches.open(CACHES.static)
      .then(cache => {
        console.log('[SW] Precaching assets');
        return cache.addAll(PRECACHE_ASSETS);
      })
      .then(() => self.skipWaiting())
      .catch(error => {
        console.error('[SW] Precache failed:', error);
      })
  );
});

// Активация Service Worker
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...', CACHE_VERSION);
  
  event.waitUntil(
    Promise.all([
      // Удалить старые кэши
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            if (cacheName.startsWith(CACHE_PREFIX) && 
                !Object.values(CACHES).includes(cacheName)) {
              console.log('[SW] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      }),
      
      // Захватить контроль над всеми клиентами
      self.clients.claim()
    ])
  );
});

// Обработка запросов
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Игнорировать не-GET запросы
  if (request.method !== 'GET') {
    return;
  }
  
  // Игнорировать chrome-extension и другие схемы
  if (!url.protocol.startsWith('http')) {
    return;
  }
  
  event.respondWith(handleFetch(request, url));
});

async function handleFetch(request, url) {
  try {
    // 1. Аудио файлы (.mp3)
    if (url.pathname.endsWith('.mp3')) {
      return await CACHE_STRATEGIES.cacheFirst(request, CACHES.audio);
    }
    
    // 2. Изображения (.jpg, .png, .webp, .svg)
    if (/\.(jpg|jpeg|png|webp|svg|gif)$/i.test(url.pathname)) {
      return await CACHE_STRATEGIES.cacheFirst(request, CACHES.images);
    }
    
    // 3. Статические ресурсы (JS, CSS)
    if (/\.(js|css)$/i.test(url.pathname)) {
      return await CACHE_STRATEGIES.cacheFirst(request, CACHES.static);
    }
    
    // 4. HTML страницы
    if (request.mode === 'navigate' || url.pathname.endsWith('.html')) {
      return await CACHE_STRATEGIES.networkFirst(request, CACHES.static);
    }
    
    // 5. API запросы (albums.json, tracks.json)
    if (url.pathname.endsWith('.json')) {
      return await CACHE_STRATEGIES.networkFirst(request, CACHES.dynamic);
    }
    
    // 6. Внешние ресурсы (CDN)
    if (url.origin !== self.location.origin) {
      return await CACHE_STRATEGIES.cacheFirst(request, CACHES.static);
    }
    
    // 7. Все остальное - сначала сеть
    return await CACHE_STRATEGIES.networkFirst(request, CACHES.dynamic);
    
  } catch (error) {
    console.error('[SW] Fetch failed:', request.url, error);
    
    // Если это навигация и нет соединения - показать офлайн страницу
    if (request.mode === 'navigate') {
      const cache = await caches.open(CACHES.static);
      const cached = await cache.match('/index.html');
      if (cached) {
        return cached;
      }
    }
    
    // Вернуть базовую ошибку
    return new Response('Offline', {
      status: 503,
      statusText: 'Service Unavailable',
      headers: new Headers({
        'Content-Type': 'text/plain'
      })
    });
  }
}

// Обработка сообщений от клиентов
self.addEventListener('message', (event) => {
  const { type, payload } = event.data;
  
  switch (type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;
      
    case 'CLEAR_CACHE':
      handleClearCache(payload);
      break;
      
    case 'CACHE_AUDIO':
      handleCacheAudio(payload);
      break;
      
    case 'GET_CACHE_SIZE':
      handleGetCacheSize().then(size => {
        event.ports[0].postMessage({ size });
      });
      break;
  }
});

// Очистка кэша
async function handleClearCache(payload) {
  const { cacheType } = payload || {};
  
  if (cacheType && CACHES[cacheType]) {
    await caches.delete(CACHES[cacheType]);
    console.log('[SW] Cache cleared:', cacheType);
  } else {
    // Очистить все кэши кроме статического
    for (const [key, cacheName] of Object.entries(CACHES)) {
      if (key !== 'static') {
        await caches.delete(cacheName);
      }
    }
    console.log('[SW] All dynamic caches cleared');
  }
}

// Кэширование аудио
async function handleCacheAudio(payload) {
  const { urls } = payload || {};
  
  if (!urls || !Array.isArray(urls)) {
    return;
  }
  
  const cache = await caches.open(CACHES.audio);
  
  for (const url of urls) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        await cache.put(url, response);
        console.log('[SW] Audio cached:', url);
      }
    } catch (error) {
      console.error('[SW] Failed to cache audio:', url, error);
    }
  }
}

// Получить размер кэша
async function handleGetCacheSize() {
  let totalSize = 0;
  
  const cacheNames = await caches.keys();
  
  for (const cacheName of cacheNames) {
    if (!cacheName.startsWith(CACHE_PREFIX)) continue;
    
    const cache = await caches.open(cacheName);
    const requests = await cache.keys();
    
    for (const request of requests) {
      const response = await cache.match(request);
      if (response) {
        const blob = await response.blob();
        totalSize += blob.size;
      }
    }
  }
  
  return totalSize;
}

// Фоновая синхронизация (опционально)
self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync:', event.tag);
  
  if (event.tag === 'sync-favorites') {
    event.waitUntil(syncFavorites());
  }
});

async function syncFavorites() {
  // Здесь можно синхронизировать избранное с сервером
  console.log('[SW] Syncing favorites...');
}

// Push уведомления (опционально)
self.addEventListener('push', (event) => {
  console.log('[SW] Push received');
  
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'Витрина Разбита';
  const options = {
    body: data.body || 'Новое уведомление',
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-72.png',
    tag: data.tag || 'default',
    data: data.url || '/'
  };
  
  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// Клик по уведомлению
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  event.waitUntil(
    clients.openWindow(event.notification.data)
  );
});

console.log('[SW] Service Worker loaded', CACHE_VERSION);
