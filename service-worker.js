// service-worker.js
// Optimized Service Worker for "Vi3na1bita" (v8.1.6)

const SW_VERSION = '8.1.6';

// Cache Names (Required by lint-sw.mjs)
const CORE_CACHE = `vitrina-core-v${SW_VERSION}`;
const RUNTIME_CACHE = `vitrina-runtime-v${SW_VERSION}`;
const MEDIA_CACHE = `vitrina-media-v${SW_VERSION}`;
const OFFLINE_CACHE = `vitrina-offline-v${SW_VERSION}`;
const META_CACHE = `vitrina-meta-v${SW_VERSION}`;

// Config (Required by lint-sw.mjs - do not remove)
const DEFAULT_SW_CONFIG = {
  mediaMaxCacheMB: 150,
  nonRangeMaxStoreMB: 25,
  nonRangeMaxStoreMBSlow: 10,
  allowUnknownSize: false,
  revalidateDays: 7
};

// === ДОБАВЛЕНО: Глобальный стейт Авиарежима ===
let isAirplaneMode = false;

// Core Assets (App Shell)
const STATIC_ASSETS = [
  './', './index.html', './news.html', './manifest.json',
  './styles/main.css', './img/logo.png', './img/star.png', './img/star2.png',
  './icons/favicon-32.png', './icons/favicon-16.png', './icons/apple-touch-icon.png',
  './scripts/core/bootstrap.js', './scripts/core/config.js', './scripts/core/utils.js',
  './scripts/core/favorites-manager.js',
  './scripts/app/gallery.js', './scripts/ui/notify.js',
  './scripts/ui/sleep.js', './scripts/ui/lyrics-modal.js', './scripts/ui/sysinfo.js',
  './scripts/ui/modals.js',
  './scripts/ui/offline-modal.js', './scripts/ui/offline-indicators.js',
  './scripts/ui/cache-progress-overlay.js', './scripts/ui/statistics-modal.js',
  './scripts/app/player-ui.js', './scripts/app/albums.js',
  './scripts/app.js', './src/PlayerCore.js',
  './scripts/app/offline-ui-bootstrap.js', './scripts/app/playback-cache-bootstrap.js',
  './scripts/stats/global-stats.js'
];

// Helper: Normalize URL for strict cache matching
const norm = (u) => { 
  try { 
    const p = new URL(u, self.registration.scope); 
    p.hash = ''; p.search = ''; 
    if(p.pathname.endsWith('/')) p.pathname += 'index.html'; 
    return p.href; 
  } catch { return String(u); } 
};
const STATIC_SET = new Set(STATIC_ASSETS.map(norm));

// --- Lifecycle ---

// Optimized Install: Best-effort caching
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CORE_CACHE).then(async (cache) => {
      const promises = STATIC_ASSETS.map(url => {
        const req = new Request(url); 
        return fetch(req).then(res => {
          if (res.ok && !res.redirected) return cache.put(req, res);
          console.warn('SW: Skipped (redirect/fail):', url);
        }).catch(err => console.warn('SW: Fetch error', url, err));
      });
      await Promise.all(promises);
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.map(k => {
    if (![CORE_CACHE, RUNTIME_CACHE, MEDIA_CACHE, OFFLINE_CACHE, META_CACHE].includes(k)) {
      return caches.delete(k);
    }
  }))).then(() => self.clients.claim()));
});

// --- Fetch Strategy ---

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // === ДОБАВЛЕНО: СТРОГАЯ ПОЛИТИКА АВИАРЕЖИМА ===
  if (isAirplaneMode) {
    e.respondWith(
      caches.match(req).then(cached => {
        return cached || new Response(null, { status: 503, statusText: 'Airplane Mode Active' });
      })
    );
    return;
  }

  // 1. Audio Bypass: Network Only
  if (/\.(mp3|ogg|m4a|flac)$/i.test(url.pathname)) {
    return; // Fallback to browser network stack
  }

  // 2. Static Assets: Cache First (Strict)
  if (STATIC_SET.has(norm(url.href))) {
    e.respondWith(
      caches.open(CORE_CACHE).then(c => c.match(req)).then(r => r || fetch(req).then(n => {
        if(n.ok) caches.open(CORE_CACHE).then(c => c.put(req, n.clone()));
        return n;
      }))
    );
    return;
  }

  // 3. Default: Network First -> Runtime Cache (Stale-While-Revalidate pattern simplified)
  e.respondWith(
    caches.match(req).then(cached => {
      const networked = fetch(req).then(res => {
        if (res.ok && url.protocol.startsWith('http')) {
          const clone = res.clone();
          caches.open(RUNTIME_CACHE).then(c => c.put(req, clone));
        }
        return res;
      });
      return cached || networked;
    })
  );
});

// --- Messaging API ---

self.addEventListener('message', (e) => {
  const d = e.data;
  if (!d || typeof d !== 'object') return;
  const port = e.ports[0];

  // === ДОБАВЛЕНО: Синхронизация состояния Авиарежима ===
  if (d.type === 'SYNC_AIRPLANE_MODE') {
    isAirplaneMode = !!d.payload;
    return;
  }

  switch (d.type) {
    case 'GET_SW_VERSION':
      if (port) port.postMessage({ version: SW_VERSION });
      break;

    case 'SKIP_WAITING':
      self.skipWaiting();
      break;

    case 'CLEAR_CACHE':
      e.waitUntil(caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k)))));
      break;

    case 'WARM_OFFLINE_SHELL': 
      e.waitUntil((async () => {
        try {
          const c = await caches.open(OFFLINE_CACHE);
          const urls = (d.payload?.urls || []);
          await Promise.all(urls.map(u => c.add(u).catch(()=>{})));
          if (port) port.postMessage({ ok: true });
        } catch (err) { if (port) port.postMessage({ ok: false, error: String(err) }); }
      })());
      break;

    case 'GET_CACHE_SIZE': 
      if (!port) return;
      e.waitUntil((async () => {
        let size = 0, entries = 0;
        try {
          for (const name of await caches.keys()) {
            const c = await caches.open(name);
            const keys = await c.keys();
            entries += keys.length;
            for (const k of keys) {
              const r = await c.match(k);
              if (r) {
                const len = r.headers.get('content-length');
                if (len) size += parseInt(len, 10) || 0;
              }
            }
          }
        } catch {}
        port.postMessage({ size, entries, approx: true });
      })());
      break;
  }
});
