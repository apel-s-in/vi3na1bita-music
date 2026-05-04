const SW_VERSION = '8.3.5';
const CORE_CACHE = `vitrina-core-v${SW_VERSION}`, RUNTIME_CACHE = `vitrina-runtime-v${SW_VERSION}`, MEDIA_CACHE = `vitrina-media-v${SW_VERSION}`, OFFLINE_CACHE = `vitrina-offline-v${SW_VERSION}`, META_CACHE = `vitrina-meta-v${SW_VERSION}`;
const DEFAULT_SW_CONFIG = { mediaMaxCacheMB: 150, nonRangeMaxStoreMB: 25, nonRangeMaxStoreMBSlow: 10, allowUnknownSize: false, revalidateDays: 7 };
let isAirplaneMode = false;
const STATIC_ASSETS = ['./','./index.html','./oauth-callback.html','./manifest.json','./albums.json','./audio/silence.mp3','./data/lyrics-index-v1.json','./styles/base.css','./styles/ui-core.css','./styles/main.css','./styles/player.css','./styles/showcase.css','./styles/offline.css','./styles/profile.css','./img/logo.png','./icons/ui-sprite.svg','./icons/favicon-32.png','./icons/favicon-16.png','./icons/apple-touch-icon.png','./scripts/core/bootstrap.js','./scripts/core/config.js','./scripts/core/utils.js','./scripts/core/favorites-manager.js','./scripts/core/device-identity.js','./scripts/core/device-profile.js','./scripts/core/device-linking.js','./scripts/core/yandex-auth.js','./scripts/core/yandex-disk-transport.js','./scripts/core/yandex-backup-disk.js','./scripts/core/yandex-device-settings-disk.js','./scripts/core/yandex-disk.js','./scripts/app/gallery.js','./scripts/ui/icon-utils.js','./scripts/ui/notify.js','./scripts/ui/sleep-timer.js','./scripts/ui/lyrics-modal.js','./scripts/ui/sysinfo.js','./scripts/ui/modals.js','./scripts/app/profile/view.js','./scripts/app/profile/model.js','./scripts/app/profile/render-shell.js','./scripts/app/profile/profile-tab-renderers.js','./scripts/app/profile/profile-tab-bindings.js','./scripts/app/profile/account-bindings.js','./scripts/app/profile/profile-ui-kit.js','./scripts/app/profile/account-benefits-view.js','./scripts/app/profile/account-devices-view.js','./scripts/app/profile/actions.js','./scripts/app/profile/live-bindings.js','./scripts/app/profile/stats-view.js','./scripts/app/profile/recs-view.js','./scripts/app/profile/logs-formatters.js','./scripts/app/profile/logs-view.js','./scripts/app/profile/yandex-actions.js','./scripts/app/profile/backup-info-modal.js','./scripts/app/profile/restore-preview-modal.js','./scripts/app/profile/restore-diff.js','./scripts/app/profile/yandex-modals.js','./scripts/app/profile/fresh-restore-modal.js','./scripts/app/profile/yandex-auth-view.js','./scripts/app/profile/yandex-auto-sync.js','./scripts/app/profile/yandex-restore-flow.js','./scripts/app/profile/yandex-runtime-refresh.js','./scripts/app/profile/auth-onboarding-orchestrator.js','./scripts/app/profile/yandex-preload-cache.js','./scripts/app/profile/cloud-ui-helpers.js','./scripts/app/profile/restore-decision.js','./scripts/app/profile/restore-backup-runner.js','./scripts/analytics/cloud-contract.js','./scripts/analytics/snapshot-contract.js','./scripts/analytics/device-settings-contract.js','./scripts/analytics/event-contract.js','./scripts/analytics/tombstone-contract.js','./scripts/analytics/achievement-state.js','./scripts/analytics/sync-dirty-events.js','./scripts/analytics/backup-event-cleanup.js','./scripts/analytics/backup-builders.js','./scripts/analytics/backup-upload-runner.js','./scripts/analytics/backup-importers.js','./scripts/analytics/sync-state.js','./scripts/analytics/sync-scheduler.js','./scripts/analytics/sync-cloud-guard.js','./scripts/analytics/backup-sync-engine.js','./scripts/analytics/backup-merge.js','./scripts/analytics/device-registry.js','./scripts/ui/offline-modal.js','./scripts/ui/offline-indicators.js','./scripts/ui/cache-progress-overlay.js','./scripts/ui/statistics-modal.js','./scripts/app/player/favorites-only-resolver.js','./scripts/app/player/favorites-only-actions.js','./scripts/app/player-ui.js','./scripts/app/albums.js','./scripts/app/profile/achievements-view.js','./scripts/app/profile/carousel-flat.js','./scripts/app/profile/template.js','./scripts/app/profile/settings-download-section.js','./scripts/app/profile/settings-interface-section.js','./scripts/app/profile/settings-data-section.js','./scripts/app/profile/settings-view.js','./scripts/ui/progress-formatters.js','./scripts/ui/logo-pulse.js','./scripts/app.js','./src/PlayerCore.js','./src/player-core/media-session.js','./src/player-core/ios-audio-keeper.js','./scripts/app/track-registry.js','./scripts/app/offline-ui-bootstrap.js','./scripts/app/playback-cache-bootstrap.js','./data/track-profiles-index.json','./scripts/intel/roadmap.js','./scripts/intel/flags.js','./scripts/intel/bootstrap.js','./scripts/intel/shared/contracts.js','./scripts/intel/shared/bus.js','./scripts/intel/shared/guards.js','./scripts/intel/shared/helpers.js','./scripts/intel/track/track-profiles.js','./scripts/intel/track/track-presentation.js','./scripts/intel/track/track-relations.js','./scripts/intel/listener/listener-profile.js','./scripts/intel/listener/listener-collection.js','./scripts/intel/recs/recommendation-engine.js','./scripts/intel/recs/recommendation-strategies.js','./scripts/intel/recs/recommendation-reasons.js','./scripts/intel/recs/rediscovery.js','./scripts/intel/providers/provider-consents.js','./scripts/intel/providers/provider-identity.js','./scripts/intel/providers/hybrid-sync.js','./scripts/intel/providers/provider-actions.js','./scripts/intel/telemetry/telemetry-mapper.js','./scripts/intel/community/cohorts.js','./scripts/intel/community/similar-listeners.js','./scripts/intel/community/community-stats.js','./scripts/intel/ui/track-profile-modal.js','./scripts/intel/ui/profile-insights.js','./scripts/intel/ui/showcase-semantic.js'];
const norm = u => { try { const p = new URL(u, self.registration.scope); p.hash = ''; p.search = ''; if (p.pathname.endsWith('/')) p.pathname += 'index.html'; return p.href; } catch { return String(u); } };
const STATIC_SET = new Set([...new Set(STATIC_ASSETS)].map(norm));

self.addEventListener('install', e => e.waitUntil((async () => {
  const c = await caches.open(CORE_CACHE);
  await Promise.all(STATIC_ASSETS.map(async u => { try { const req = new Request(norm(u), { cache: 'no-cache' }), res = await fetch(req); if (res.ok && !res.redirected) await c.put(req, res.clone()); } catch {} }));
  // Убрано безусловное self.skipWaiting(), чтобы не перезагружать страницу пользователю прямо во время авторизации или прослушивания музыки.
})()));

self.addEventListener('activate', e => e.waitUntil((async () => {
  const keep = new Set([CORE_CACHE, RUNTIME_CACHE, MEDIA_CACHE, OFFLINE_CACHE, META_CACHE]);
  const keys = await caches.keys();
  await Promise.all(keys.map(n => keep.has(n) ? Promise.resolve() : caches.delete(n)));
  // Намеренно НЕ вызываем self.clients.claim().
  // Это предотвращает controllerchange у уже открытой вкладки (и соответственно принудительный reload).
  (await self.clients.matchAll({ type: 'window', includeUncontrolled: true }))
    .forEach(c => c.postMessage({ type: 'SW_VERSION', version: SW_VERSION }));
})()));

self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url), isSilenceFile = url.pathname.endsWith('/audio/silence.mp3');
  if (!isSilenceFile && (req.headers.get('range') || /\.(mp3|ogg|m4a|flac)$/i.test(url.pathname))) return;
  
  if (isAirplaneMode) return e.respondWith(caches.match(req).then(c => c || new Response(null, { status: 503, statusText: 'Airplane Mode Active' })));

  if (STATIC_SET.has(norm(url.href))) return e.respondWith((async () => {
    const c = await caches.open(CORE_CACHE), key = new Request(norm(url.href)), cached = await c.match(key);
    if (cached) return cached;
    const res = await fetch(req); if (res.ok && !res.redirected) await c.put(key, res.clone());
    return res;
  })());

  if (url.hostname.includes('yandexcloud.net') || url.hostname.includes('github.io')) {
    if (/\.(png|jpe?g|webp|avif|gif|svg)$/i.test(url.pathname)) return e.respondWith((async () => {
      const c = await caches.open(MEDIA_CACHE), cached = await c.match(req);
      if (cached) return cached; const res = await fetch(req); if (res.ok) await c.put(req, res.clone()); return res;
    })());
    if (url.pathname.endsWith('.json')) return e.respondWith((async () => {
      const c = await caches.open(RUNTIME_CACHE), cached = await c.match(req);
      const fetchPromise = fetch(req).then(async res => { if (res.ok) await c.put(req, res.clone()); return res; }).catch(() => cached);
      return cached || fetchPromise;
    })());
    return;
  }

  e.respondWith((async () => {
    try {
      const res = await fetch(req);
      if (res.ok && res.status === 200 && url.protocol.startsWith('http') && url.hostname === self.location.hostname) {
        const c = await caches.open(RUNTIME_CACHE); await c.put(req, res.clone());
      }
      return res;
    } catch { return await caches.match(req) || new Response(null, { status: 503 }); }
  })());
});

self.addEventListener('message', e => {
  const d = e.data, p = e.ports[0]; if (!d) return;
  if (d.type === 'SYNC_AIRPLANE_MODE') isAirplaneMode = !!d.payload;
  else if (d.type === 'GET_SW_VERSION' && p) p.postMessage({ version: SW_VERSION });
  else if (d.type === 'SKIP_WAITING') self.skipWaiting();
  else if (d.type === 'CLEAR_CACHE') e.waitUntil(caches.keys().then(k => Promise.all(k.map(n => caches.delete(n)))));
  else if (d.type === 'GET_CACHE_SIZE' && p) e.waitUntil((async () => {
    let s = 0, n = 0;
    try { for (const k of await caches.keys()) { const c = await caches.open(k), reqs = await c.keys(); n += reqs.length; for (const r of reqs) { const res = await c.match(r); if (res) s += parseInt(res.headers.get('content-length') || 0, 10); } } } catch {}
    p.postMessage({ size: s, entries: n, approx: true });
  })());
});
