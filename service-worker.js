// service-worker.js
// Optimized Service Worker for "Vi3na1bita" (v8.1.8) - Spec Compliant

const SW_VERSION = '8.1.8';

// Cache Names (Required by lint-sw.mjs)
const CORE_CACHE = `vitrina-core-v${SW_VERSION}`;
const RUNTIME_CACHE = `vitrina-runtime-v${SW_VERSION}`;
const MEDIA_CACHE = `vitrina-media-v${SW_VERSION}`; // Reserved: audio cached via IndexedDB, not SW
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

let isAirplaneMode = false;

const STATIC_ASSETS = [
  './', './index.html', './news.html', './manifest.json',
  './albums.json',
  './data/lyrics-index-v1.json',
  './styles/main.css', './img/logo.png', './img/star.png', './img/star2.png',
  './icons/favicon-32.png', './icons/favicon-16.png', './icons/apple-touch-icon.png',
  './scripts/core/bootstrap.js', './scripts/core/config.js', './scripts/core/utils.js',
  './scripts/core/favorites-manager.js',
  './scripts/app/gallery.js', './scripts/ui/notify.js',
  './scripts/ui/sleep-timer.js', './scripts/ui/lyrics-modal.js', './scripts/ui/sysinfo.js',
  './scripts/ui/modals.js',
  './scripts/ui/offline-modal.js', './scripts/ui/offline-indicators.js',
  './scripts/ui/cache-progress-overlay.js', './scripts/ui/statistics-modal.js',
  './scripts/app/player-ui.js', './scripts/app/albums.js',
  './scripts/app.js', './src/PlayerCore.js',
  './src/player-core/media-session.js',
  './scripts/app/track-registry.js',
  './scripts/core/favorites-manager.js',
  './scripts/app/offline-ui-bootstrap.js', './scripts/app/playback-cache-bootstrap.js'
];

const norm = (u) => { 
  try { 
    const p = new URL(u, self.registration.scope); 
    p.hash = ''; p.search = ''; 
    if (p.pathname.endsWith('/')) p.pathname += 'index.html'; 
    return p.href; 
  } catch { return String(u); } 
};
const STATIC_SET = new Set(STATIC_ASSETS.map(norm));

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CORE_CACHE).then(async (c) => {
      await Promise.all(STATIC_ASSETS.map(u => 
        fetch(new Request(u)).then(r => { if (r.ok && !r.redirected) c.put(u, r); }).catch(()=>{})
      ));
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(k => Promise.all(k.map(n => ![CORE_CACHE, RUNTIME_CACHE, MEDIA_CACHE, OFFLINE_CACHE, META_CACHE].includes(n) && caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Spec 5.2 & 5.3: Airplane mode fully blocks all network requests in SW layer too.
    if (/\.(mp3|ogg|m4a|flac)$/i.test(url.pathname)) {
      if (isAirplaneMode) e.respondWith(new Response(null, { status: 503, statusText: 'Airplane Mode Active' }));
      return;
    }

    if (isAirplaneMode) {
      e.respondWith(caches.match(req).then(c => c || new Response(null, { status: 503, statusText: 'Airplane Mode Active' })));
      return;
    }

  // Static core assets (Cache First)
  if (STATIC_SET.has(norm(url.href))) {
    e.respondWith(
      caches.open(CORE_CACHE).then(c => c.match(req)).then(r => r || fetch(req).then(n => {
        if(n.ok) caches.open(CORE_CACHE).then(cx => cx.put(req, n.clone()));
        return n;
      }))
    );
    return;
  }

  // Fallback (Network First -> Cache)
  e.respondWith(
    caches.match(req).then(cached => cached || fetch(req).then(r => {
      if (r.ok && url.protocol.startsWith('http')) {
        const cl = r.clone();
        caches.open(RUNTIME_CACHE).then(cx => cx.put(req, cl));
      }
      return r;
    }).catch(() => cached))
  );
});

self.addEventListener('message', (e) => {
  const d = e.data, p = e.ports[0];
  if (!d) return;

  if (d.type === 'SYNC_AIRPLANE_MODE') {
    isAirplaneMode = !!d.payload;
  } else if (d.type === 'GET_SW_VERSION' && p) {
    p.postMessage({ version: SW_VERSION });
  } else if (d.type === 'SKIP_WAITING') {
    self.skipWaiting();
  } else if (d.type === 'CLEAR_CACHE') {
    e.waitUntil(caches.keys().then(k => Promise.all(k.map(n => caches.delete(n)))));
  } else if (d.type === 'GET_CACHE_SIZE' && p) {
    e.waitUntil((async () => {
      let s = 0, n = 0;
      try {
        for (const k of await caches.keys()) {
          const c = await caches.open(k), reqs = await c.keys();
          n += reqs.length;
          for (const r of reqs) {
            const res = await c.match(r);
            if (res) s += parseInt(res.headers.get('content-length') || 0, 10);
          }
        }
      } catch {}
      p.postMessage({ size: s, entries: n, approx: true });
    })());
  }
});
