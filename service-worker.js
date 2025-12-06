// service-worker.js
// Service Worker для PWA - совместим с CI валидатором
const SW_VERSION = '1.0.0';
const CORE_CACHE = 'vitrina-core-v1.0.0';
const RUNTIME_CACHE = 'vitrina-runtime-v1';
const MEDIA_CACHE = 'vitrina-media-v1';
const OFFLINE_CACHE = 'vitrina-offline-v1';
const META_CACHE = 'vitrina-meta-v1';
const DEFAULT_SW_CONFIG = {
  mediaMaxCacheMB: 150,
  nonRangeMaxStoreMB: 25,
  nonRangeMaxStoreMBSlow: 10,
  allowUnknownSize: false,
  revalidateDays: 7
};

// Статичные ресурсы для кэширования
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './styles/main.css',
  './scripts/core/bootstrap.js',
  './scripts/core/config.js',
  './src/PlayerCore.js',
  './scripts/player/player-adapter.js',
  './scripts/ui/notify.js',
  './scripts/ui/favorites.js',
  './scripts/ui/favorites-const.js',
  './scripts/ui/favorites-storage.js',
  './scripts/ui/favorites-data.js',
  './scripts/ui/mini.js',
  './scripts/ui/sysinfo.js',
  './scripts/app/albums.js',
  './scripts/app/navigation.js',
  './scripts/app/downloads.js',
  './scripts/app/background-audio.js',
  './scripts/app/background-events.js',
  './scripts/app.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './img/logo.png',
  './img/star.png',
  './img/star2.png',
  './img/icon_album/icon-album-00.png',
  './img/icon_album/icon-album-01.png',
  './img/icon_album/icon-album-02.png',
  './img/icon_album/icon-album-news.png',
  './img/icon_album/icon-album+00.png'
];

// Установка
self.addEventListener('install', (event) => {
  console.log(`[SW v${SW_VERSION}] Installing...`);
  event.waitUntil(
    caches.open(CORE_CACHE)
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

// Активация
self.addEventListener('activate', (event) => {
  console.log(`[SW v${SW_VERSION}] Activating...`);
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        const validCaches = [CORE_CACHE, RUNTIME_CACHE, MEDIA_CACHE, OFFLINE_CACHE, META_CACHE];
        return Promise.all(
          cacheNames
            .filter((name) => !validCaches.includes(name))
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
  
  if (!url.protocol.startsWith('http')) return;
  
  // Обработка Range-запросов для аудио
  if (request.headers.has('range') && url.pathname.endsWith('.mp3')) {
    event.respondWith(handleRangeRequest(request));
    return;
  }
  
  if (url.hostname === 'cdn.jsdelivr.net') {
    event.respondWith(fetch(request));
    return;
  }
  
  if (request.url.endsWith('.mp3')) {
    event.respondWith(networkFirst(request, MEDIA_CACHE));
    return;
  }
  
  event.respondWith(cacheFirst(request));
});

// Обработка Range-запросов
async function handleRangeRequest(request) {
  try {
    const cache = await caches.open(MEDIA_CACHE);
    const cached = await cache.match(request);
    
    if (cached) {
      const rangeHeader = request.headers.get('range');
      if (rangeHeader) {
        const parts = rangeHeader.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : undefined;
        
        const blob = await cached.blob();
        const slicedBlob = blob.slice(start, end ? end + 1 : blob.size);
        
        const responseHeaders = new Headers(cached.headers);
        responseHeaders.set('Content-Range', `bytes ${start}-${end || (blob.size - 1)}/${blob.size}`);
        responseHeaders.set('Accept-Ranges', 'bytes');
        responseHeaders.set('Content-Length', slicedBlob.size);
        
        return new Response(slicedBlob, {
          status: 206,
          statusText: 'Partial Content',
          headers: responseHeaders
        });
      }
    }
    
    return cached;
  } catch (error) {
    console.error('Range request failed:', error);
    return fetch(request);
  }
}

async function cacheFirst(request) {
  try {
    const cache = await caches.open(CORE_CACHE);
    const cached = await cache.match(request);
    if (cached) {
      console.log('[SW] Serving from cache:', request.url);
      return cached;
    }
    
    const response = await fetch(request);
    if (response.ok && request.method === 'GET') {
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    console.error('[SW] Cache First error:', error);
    return new Response('Offline', {
      status: 503,
      statusText: 'Service Unavailable',
      headers: new Headers({ 'Content-Type': 'text/plain' })
    });
  }
}

async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    if (cached) {
      console.log('[SW] Serving from cache (offline):', request.url);
      return cached;
    }
    throw error;
  }
}

// Управление офлайн-кэшем
self.addEventListener('message', (event) => {
  if (event.data?.type === 'OFFLINE_CACHE_ADD') {
    const { resources } = event.data;
    event.waitUntil(
      caches.open(OFFLINE_CACHE)
        .then(cache => cache.addAll(resources))
        .then(() => event.ports[0]?.postMessage({ status: 'success' }))
        .catch(error => {
          console.error('[SW] OFFLINE_CACHE_ADD failed:', error);
          event.ports[0]?.postMessage({ status: 'error', message: error.message });
        })
    );
  }
  
  if (event.data?.type === 'OFFLINE_CACHE_CLEAR_CURRENT') {
    event.waitUntil(
      caches.delete(OFFLINE_CACHE)
        .then(() => caches.open(OFFLINE_CACHE))
        .then(() => event.ports[0]?.postMessage({ status: 'success' }))
        .catch(error => {
          console.error('[SW] OFFLINE_CACHE_CLEAR_CURRENT failed:', error);
          event.ports[0]?.postMessage({ status: 'error', message: error.message });
        })
    );
  }
  
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data?.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then((names) => {
        return Promise.all(names.map((name) => caches.delete(name)));
      })
    );
  }
  
  if (event.data?.type === 'GET_SW_VERSION') {
    event.ports[0]?.postMessage({ version: SW_VERSION });
  }
  
  if (event.data?.type === 'REQUEST_OFFLINE_STATE') {
    const offline = !navigator.onLine;
    event.ports[0]?.postMessage({ type: 'OFFLINE_STATE', value: offline });
  }
});

console.log(`[SW v${SW_VERSION}] Loaded`);
