// service-worker.js — Единый Service Worker v8.1.0
const SW_VERSION = '8.1.0';
const CACHE_NAME = `vitrina-v${SW_VERSION}`;

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
  './scripts/core/bootstrap.js',
  './scripts/core/config.js',
  './scripts/core/utils.js',
  './scripts/app/background.js',
  './scripts/app/player-ui.js',
  './scripts/app/gallery.js',
  './scripts/app/albums.js',
  './scripts/app/downloads.js',
  './scripts/ui/notify.js',
  './scripts/ui/favorites.js',
  './scripts/ui/sleep.js',
  './scripts/ui/modals.js',
  './scripts/app.js',
  './src/PlayerCore.js'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(c => c.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => 
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  
  const url = new URL(e.request.url);
  
  // Аудио — прямой запрос без кэша
  if (/\.(mp3|ogg|m4a|flac)$/i.test(url.pathname)) {
    e.respondWith(fetch(e.request));
    return;
  }
  
  // Остальное — cache-first с fallback на сеть
  e.respondWith(
    caches.match(e.request).then(r => {
      if (r) return r;
      
      return fetch(e.request).then(res => {
        if (res.ok && res.type === 'basic') {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        }
        return res;
      });
    })
  );
});

self.addEventListener('message', e => {
  const { type } = e.data || {};
  
  if (type === 'GET_SW_VERSION' && e.ports && e.ports[0]) {
    e.ports[0].postMessage({ version: SW_VERSION });
  } else if (type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
