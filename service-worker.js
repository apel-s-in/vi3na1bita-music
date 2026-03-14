const SW_VERSION = '8.1.16';

// Cache Names (Required by lint-sw.mjs)
const CORE_CACHE = `vitrina-core-v${SW_VERSION}`;
const RUNTIME_CACHE = `vitrina-runtime-v${SW_VERSION}`;
const MEDIA_CACHE = `vitrina-media-v${SW_VERSION}`; 
const OFFLINE_CACHE = `vitrina-offline-v${SW_VERSION}`;
const META_CACHE = `vitrina-meta-v${SW_VERSION}`;

const DEFAULT_SW_CONFIG = {
  mediaMaxCacheMB: 150,
  nonRangeMaxStoreMB: 25,
  nonRangeMaxStoreMBSlow: 10,
  allowUnknownSize: false,
  revalidateDays: 7
};

let isAirplaneMode = false;

const STATIC_ASSETS = [
  './', './index.html', './manifest.json',
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
const STATIC_SET = new Set([...new Set(STATIC_ASSETS)].map(norm));

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

  // 1. СТРОГИЙ ОБХОД ДЛЯ АУДИО (Игнорируем Range запросы и файлы музыки)
  // Строгий пропуск аудио. Возврат 503 ломает HTML5 Audio/Howler намертво.
  if (req.headers.get('range') || /\.(mp3|ogg|m4a|flac)$/i.test(url.pathname)) {
    return; // Всегда отдаем браузеру
  }

  if (isAirplaneMode) {
    e.respondWith(caches.match(req).then(c => c || new Response(null, { status: 503, statusText: 'Airplane Mode Active' })));
    return;
  }

  // Static core assets (Cache First)
  if (STATIC_SET.has(norm(url.href))) {
    e.respondWith(
      caches.open(CORE_CACHE).then(async c => {
        const cached = await c.match(req);
        if (cached) return cached;
        const n = await fetch(req);
        if (n.ok) {
          const cl = n.clone();
          caches.open(CORE_CACHE).then(cx => cx.put(req, cl)).catch(() => {});
        }
        return n;
      })
    );
    return;
  }

  // Умное кэширование удаленных источников (Снижение расходов на GET/OPTIONS)
  const isRemoteAsset = url.hostname.includes('yandexcloud.net') || url.hostname.includes('github.io');
  
  if (isRemoteAsset) {
    // 1. Картинки: жесткий Cache-First (Они не меняются)
    if (/\.(png|jpe?g|webp|avif|gif|svg)$/i.test(url.pathname)) {
      e.respondWith(
        caches.match(req).then(cached => {
          if (cached) return cached;
          return fetch(req).then(res => {
            if (res.ok) caches.open(MEDIA_CACHE).then(c => c.put(req, res.clone()));
            return res;
          });
        })
      );
      return;
    }
    // 2. Конфиги (JSON): Stale-While-Revalidate (Мгновенная отдача + фоновое обновление)
    if (url.pathname.endsWith('.json')) {
      e.respondWith(
        caches.match(req).then(cached => {
          const fetchPromise = fetch(req).then(res => {
            if (res.ok) caches.open(RUNTIME_CACHE).then(c => c.put(req, res.clone()));
            return res;
          }).catch(() => cached);
          return cached || fetchPromise;
        })
      );
      return;
    }
    return; // Аудио и прочее всё ещё идут мимо SW напрямую в браузер/OfflineManager
  }

  // Fallback (Network First -> Cache) только для локальных ресурсов
  e.respondWith(
    (async () => {
      try {
        const r = await fetch(req);
        if (r.ok && r.status === 200 && url.protocol.startsWith('http') && url.hostname === self.location.hostname) {
          const cl = r.clone();
          caches.open(RUNTIME_CACHE).then(cx => cx.put(req, cl)).catch(() => {});
        }
        return r;
      } catch {
        const cached = await caches.match(req);
        return cached || new Response(null, { status: 503 });
      }
    })()
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
