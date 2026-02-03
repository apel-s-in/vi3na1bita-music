// service-worker.js
// Optimized Service Worker for "Vi3na1bita"

const SW_VERSION = '8.1.0';

// Cache Names (Required by lint-sw.mjs)
const CORE_CACHE = `vitrina-core-v${SW_VERSION}`;
const RUNTIME_CACHE = `vitrina-runtime-v${SW_VERSION}`;
const MEDIA_CACHE = `vitrina-media-v${SW_VERSION}`;
const OFFLINE_CACHE = `vitrina-offline-v${SW_VERSION}`;
const META_CACHE = `vitrina-meta-v${SW_VERSION}`;

// Config (Required by lint-sw.mjs)
const DEFAULT_SW_CONFIG = {
  mediaMaxCacheMB: 150,
  nonRangeMaxStoreMB: 25,
  nonRangeMaxStoreMBSlow: 10,
  allowUnknownSize: false,
  revalidateDays: 7
};

// Core Assets
const STATIC_ASSETS = [
  './', './index.html', './news.html', './manifest.json',
  './styles/main.css', './img/logo.png', './img/star.png', './img/star2.png',
  './icons/favicon-32.png', './icons/favicon-16.png', './icons/apple-touch-icon.png',
  './scripts/core/bootstrap.js', './scripts/core/config.js', './scripts/app/gallery.js',
  './scripts/ui/notify.js', './scripts/ui/favorites.js', './scripts/ui/sleep.js',
  './scripts/ui/lyrics-modal.js', './scripts/ui/sysinfo.js', './scripts/app/player-ui.js',
  './scripts/app/albums.js', './scripts/app/navigation.js', './scripts/app.js',
  './src/PlayerCore.js'
];

// Helper: Normalize URL for strict cache matching
const norm = (u) => { try { const p = new URL(u, self.registration.scope); p.hash = ''; p.search = ''; if(p.pathname.endsWith('/')) p.pathname += 'index.html'; return p.href; } catch { return String(u); } };
const STATIC_SET = new Set(STATIC_ASSETS.map(norm));

// --- Lifecycle ---

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CORE_CACHE).then(c => c.addAll(STATIC_ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.map(k => {
    if (![CORE_CACHE, RUNTIME_CACHE, MEDIA_CACHE, OFFLINE_CACHE, META_CACHE].includes(k)) return caches.delete(k);
  }))).then(() => self.clients.claim()));
});

// --- Fetch Strategy ---

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // 1. Audio: Network Only (Handled by IDB/CacheDB logic, bypass SW cache to avoid range issues)
  if (/\.(mp3|ogg|m4a|flac)$/i.test(url.pathname)) {
    e.respondWith(fetch(req));
    return;
  }

  // 2. Static Assets: Cache First (Strict)
  if (STATIC_SET.has(norm(url.href))) {
    e.respondWith(caches.open(CORE_CACHE).then(c => c.match(req)).then(r => r || fetch(req).then(n => {
      if(n.ok) caches.open(RUNTIME_CACHE).then(c => c.put(req, n.clone()));
      return n;
    })));
    return;
  }

  // 3. Default: Network First -> Runtime Cache
  e.respondWith(fetch(req).then(res => {
    const copy = res.clone();
    caches.open(RUNTIME_CACHE).then(c => c.put(req, copy));
    return res;
  }).catch(() => caches.match(req)));
});

// --- Messaging API ---

self.addEventListener('message', (e) => {
  const d = e.data;
  if (!d || typeof d !== 'object') return;
  const port = e.ports[0];

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

    case 'WARM_OFFLINE_SHELL': // Preload assets for offline mode
      e.waitUntil((async () => {
        try {
          const c = await caches.open(OFFLINE_CACHE);
          const urls = (d.payload?.urls || []);
          // Best-effort addAll manually to avoid full fail
          await Promise.all([...STATIC_ASSETS, ...urls].map(u => c.add(u).catch(()=>{})));
          if (port) port.postMessage({ ok: true });
        } catch (err) { if (port) port.postMessage({ ok: false, error: String(err) }); }
      })());
      break;

    case 'GET_CACHE_SIZE': // Calculate approximate usage
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
