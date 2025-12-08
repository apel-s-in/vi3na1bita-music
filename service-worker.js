// service-worker.js
// Единый Service Worker для PWA "Витрина Разбита"

const SW_VERSION = '8.0.3';

// Основные кэши (ожидаются lint-sw.mjs)
const CORE_CACHE = `vitrina-core-v${SW_VERSION}`;
const RUNTIME_CACHE = `vitrina-runtime-v${SW_VERSION}`;
const MEDIA_CACHE = `vitrina-media-v${SW_VERSION}`;
const OFFLINE_CACHE = `vitrina-offline-v${SW_VERSION}`;
const META_CACHE = `vitrina-meta-v${SW_VERSION}`;

// Конфиг по умолчанию (ожидается lint-sw.mjs)
const DEFAULT_SW_CONFIG = {
  mediaMaxCacheMB: 150,
  nonRangeMaxStoreMB: 25,
  nonRangeMaxStoreMBSlow: 10,
  allowUnknownSize: false,
  revalidateDays: 7
};

// Статический список ресурсов «ядра»
const STATIC_ASSETS = [
  './',
  './index.html',
  './news.html',
  './manifest.json',
  './styles/main.css',
  './img/logo.png',
  './img/star.png',
  './img/star2.png',
  './icons/favicon-32.png',
  './icons/favicon-16.png',
  './icons/apple-touch-icon.png',

  // Скрипты ядра и UI
  './scripts/core/bootstrap.js',
  './scripts/core/config.js',
  './scripts/app/gallery.js',
  './scripts/ui/notify.js',
  './scripts/ui/favorites-const.js',
  './scripts/ui/favorites-storage.js',
  './scripts/ui/favorites-data.js',
  './scripts/ui/favorites.js',
  './scripts/ui/favorites-view.js',
  './scripts/ui/sleep.js',
  './scripts/ui/lyrics-modal.js',
  './scripts/ui/sysinfo.js',
  './scripts/app/background-audio.js',
  './scripts/app/background-events.js',
  './scripts/app/player-ui.js',
  './scripts/app/albums.js',
  './scripts/app/navigation.js',
  './scripts/app/downloads.js',
  './scripts/app.js',
  './src/PlayerCore.js',

  // Howler.js (CDN)
  'https://cdn.jsdelivr.net/npm/howler@2.2.4/dist/howler.min.js'
];

// ========== INSTALL ==========
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CORE_CACHE)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// ========== ACTIVATE ==========
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names.map((name) => {
          if (
            name !== CORE_CACHE &&
            name !== RUNTIME_CACHE &&
            name !== MEDIA_CACHE &&
            name !== OFFLINE_CACHE &&
            name !== META_CACHE
          ) {
            return caches.delete(name);
          }
          return undefined;
        })
      )
    ).then(() => self.clients.claim())
  );
});

// ========== FETCH ==========
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Игнорируем не-GET запросы
  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  // Аудио-файлы — прямой запрос (без кэша, чтобы не ломать стриминг)
  if (/\.(mp3|ogg|m4a|flac)$/i.test(url.pathname)) {
    event.respondWith(fetch(request));
    return;
  }

  // Статика: cache-first из CORE/RUNTIME
  const isStatic = STATIC_ASSETS.some((asset) =>
    asset.startsWith('http')
      ? request.url === asset
      : request.url.endsWith(asset.replace('./', ''))
  );

  if (isStatic) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((resp) => {
          return caches.open(RUNTIME_CACHE).then((cache) => {
            cache.put(request, resp.clone());
            return resp;
          });
        });
      })
    );
    return;
  }

  // Остальное: network-first с fallback в RUNTIME_CACHE
  event.respondWith(
    fetch(request)
      .then((resp) => {
        const copy = resp.clone();
        caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
        return resp;
      })
      .catch(() => caches.match(request))
  );
});

// ========== MESSAGE API (для sysinfo.js и ServiceWorkerManager) ==========
self.addEventListener('message', (event) => {
  const { data, ports } = event;
  if (!data || typeof data !== 'object') return;

  const type = data.type;

  // Ответ версии SW для sysinfo.js
  if (type === 'GET_SW_VERSION') {
    const port = ports && ports[0];
    if (port) {
      port.postMessage({ version: SW_VERSION });
    }
    return;
  }

  // Управление жизненным циклом
  if (type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  // Заглушки под API ServiceWorkerManager — чтобы не падать
  if (type === 'CLEAR_CACHE') {
    const cacheType = data.payload && data.payload.cacheType;
    let targetNames = [CORE_CACHE, RUNTIME_CACHE, MEDIA_CACHE, OFFLINE_CACHE, META_CACHE];

    if (cacheType === 'media') {
      targetNames = [MEDIA_CACHE];
    } else if (cacheType === 'offline') {
      targetNames = [OFFLINE_CACHE];
    }

    event.waitUntil(
      caches.keys().then((names) =>
        Promise.all(
          names.map((name) => {
            if (targetNames.includes(name)) {
              return caches.delete(name);
            }
            return undefined;
          })
        )
      )
    );
    return;
  }

  if (type === 'CACHE_AUDIO') {
    // В упрощённой версии ничего не делаем, только не падаем.
    // Можно будет реализовать позже.
    return;
  }

  if (type === 'GET_CACHE_SIZE') {
    const port = ports && ports[0];
    if (!port) return;

    event.waitUntil(
      (async () => {
        let total = 0;
        try {
          const names = await caches.keys();
          for (const name of names) {
            const cache = await caches.open(name);
            const reqs = await cache.keys();
            for (const req of reqs) {
              const resp = await cache.match(req);
              if (resp) {
                const clone = resp.clone();
                const buf = await clone.arrayBuffer();
                total += buf.byteLength;
              }
            }
          }
        } catch (e) {
          // игнорируем ошибки, просто вернём то, что насчитали
        }
        port.postMessage({ size: total });
      })()
    );
    return;
  }
});
