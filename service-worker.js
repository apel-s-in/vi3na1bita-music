const SW_VERSION = '8.7.0';
const CORE_CACHE = `vitrina-core-v${SW_VERSION}`, RUNTIME_CACHE = `vitrina-runtime-v${SW_VERSION}`, MEDIA_CACHE = `vitrina-media-v${SW_VERSION}`, OFFLINE_CACHE = `vitrina-offline-v${SW_VERSION}`, META_CACHE = `vitrina-meta-v${SW_VERSION}`;
let isAirplaneMode = false;

const CORE_ASSETS = ['./','./index.html','./oauth-callback.html','./manifest.json','./albums.json','./audio/silence.mp3','./data/lyrics-index-v1.json','./data/track-profiles-index.json','./styles/base.css','./styles/ui-core.css','./styles/main.css','./styles/player.css','./styles/showcase.css','./styles/offline.css','./styles/profile.css','./img/logo.png','./icons/ui-sprite.svg','./icons/favicon-32.png','./icons/favicon-16.png','./icons/apple-touch-icon.png','./scripts/vendor/howler.min.js','./scripts/core/bootstrap.js','./scripts/core/config.js','./scripts/core/utils.js','./scripts/core/favorites-manager.js','./scripts/core/device-identity.js','./scripts/core/device-profile.js','./scripts/core/device-linking.js','./scripts/core/yandex-auth.js','./scripts/core/yandex-disk-transport.js','./scripts/core/yandex-backup-disk.js','./scripts/core/yandex-device-settings-disk.js','./scripts/core/yandex-event-archive-disk.js','./scripts/core/yandex-verified-disk.js','./scripts/core/yandex-disk.js','./src/PlayerCore.js','./src/player-core/media-session.js','./src/player-core/ios-audio-keeper.js'];
const PROFILE_ASSETS = ['./scripts/app/profile/view.js','./scripts/app/profile/model.js','./scripts/app/profile/render-shell.js','./scripts/app/profile/profile-tab-renderers.js','./scripts/app/profile/profile-tab-bindings.js','./scripts/app/profile/account-bindings.js','./scripts/app/profile/profile-render-kit.js','./scripts/app/profile/cloud-action-render-kit.js','./scripts/app/profile/archive-render-kit.js','./scripts/app/profile/ledger-health-modal.js','./scripts/app/profile/trust-check-modal.js','./scripts/app/profile/archive-maintenance-modal.js','./scripts/app/profile/verified-achievements-view.js','./scripts/app/profile/account-benefits-view.js','./scripts/app/profile/account-devices-view.js','./scripts/app/profile/tab-strip-physics.js','./scripts/app/profile/actions-trash.js','./scripts/app/profile/actions-reset.js','./scripts/app/profile/actions.js','./scripts/app/profile/live-bindings.js','./scripts/app/profile/stats-view.js','./scripts/app/profile/recs-view.js','./scripts/app/profile/logs-formatters.js','./scripts/app/profile/logs-view.js','./scripts/app/profile/yandex-actions.js','./scripts/app/profile/backup-info-modal.js','./scripts/app/profile/restore-preview-modal.js','./scripts/app/profile/restore-diff.js','./scripts/app/profile/restore-card-render-kit.js','./scripts/app/profile/fresh-restore-modal.js','./scripts/app/profile/account-cloud-renderers.js','./scripts/app/profile/yandex-auth-view.js','./scripts/app/profile/yandex-auto-sync.js','./scripts/app/profile/yandex-runtime-refresh.js','./scripts/app/profile/auth-onboarding-orchestrator.js','./scripts/app/profile/yandex-preload-cache.js','./scripts/app/profile/cloud-ui-helpers.js','./scripts/app/profile/restore-decision.js','./scripts/app/profile/restore-backup-runner.js','./scripts/app/profile/achievements-view.js','./scripts/app/profile/carousel-flat.js','./scripts/app/profile/template.js','./scripts/app/profile/settings-download-section.js','./scripts/app/profile/settings-interface-section.js','./scripts/app/profile/settings-conflict-section.js','./scripts/app/profile/settings-trash-section.js','./scripts/app/profile/settings-data-section.js','./scripts/app/profile/settings-view.js'];
const ANALYTICS_ASSETS = ['./scripts/analytics/cloud-contract.js','./scripts/analytics/snapshot-contract.js','./scripts/analytics/device-settings-contract.js','./scripts/analytics/event-archive-contract.js','./scripts/analytics/event-integrity.js','./scripts/analytics/trust-state.js','./scripts/analytics/verified-achievement-state.js','./scripts/analytics/event-contract.js','./scripts/analytics/tombstone-contract.js','./scripts/analytics/achievement-state.js','./scripts/analytics/stats-state.js','./scripts/analytics/sync-revisions.js','./scripts/analytics/sync-dirty-events.js','./scripts/analytics/backup-event-cleanup.js','./scripts/analytics/backup-builders.js','./scripts/analytics/event-archive-sync.js','./scripts/analytics/event-archive-restore.js','./scripts/analytics/archive-maintenance.js','./scripts/analytics/archive-branch-validation.js','./scripts/analytics/backup-debug.js','./scripts/analytics/backup-upload-runner.js','./scripts/analytics/backup-importers.js','./scripts/analytics/sync-state.js','./scripts/analytics/sync-scheduler.js','./scripts/analytics/sync-cloud-guard.js','./scripts/analytics/backup-sync-engine.js','./scripts/analytics/backup-branch-compare.js','./scripts/analytics/backup-recovery.js','./scripts/analytics/storage-merge-utils.js','./scripts/analytics/favorites-storage-merge.js','./scripts/analytics/playlists-storage-merge.js','./scripts/analytics/storage-merge.js','./scripts/analytics/device-registry.js','./scripts/analytics/meta-db.js','./scripts/analytics/event-logger.js','./scripts/analytics/session-tracker.js','./scripts/analytics/stats-aggregator.js','./scripts/analytics/achievement-engine.js','./scripts/analytics/achievements-dict.js','./scripts/analytics/live-stats.js','./scripts/analytics/playback-runtime.js','./scripts/analytics/playback-validity.js','./scripts/analytics/backup-summary.js','./scripts/analytics/backup-vault.js','./scripts/analytics/share-generator.js'];
const UI_ASSETS = ['./scripts/ui/icon-utils.js','./scripts/ui/notify.js','./scripts/ui/sleep-timer.js','./scripts/ui/lyrics-modal.js','./scripts/ui/sysinfo.js','./scripts/ui/modals.js','./scripts/ui/offline-modal.js','./scripts/ui/offline-indicators.js','./scripts/ui/cache-progress-overlay.js','./scripts/ui/track-statistics-modal.js','./scripts/ui/statistics-modal.js','./scripts/ui/progress-formatters.js','./scripts/ui/logo-pulse.js','./scripts/ui/news-inline.js','./scripts/ui/app-modals.js','./scripts/app/gallery.js','./scripts/app/player/favorites-only-resolver.js','./scripts/app/player/favorites-only-actions.js','./scripts/app/player/playback-context-source.js','./scripts/app/player/playback-clock.js','./scripts/app/player-ui.js','./scripts/app/player-ui/lyrics.js','./scripts/app/albums.js','./scripts/app/albums/specials.js','./scripts/app/track-registry.js','./scripts/app/offline-ui-bootstrap.js','./scripts/app/playback-cache-bootstrap.js','./scripts/app/showcase/index.js','./scripts/app/showcase/actions.js','./scripts/app/showcase/edit.js','./scripts/app/showcase/lyrics-search.js','./scripts/app/showcase/modals.js','./scripts/app/showcase/playlists.js','./scripts/app/showcase/render.js','./scripts/app/showcase/search.js','./scripts/app/showcase/store.js','./scripts/app/promocode.js','./scripts/app.js','./scripts/offline/cache-db.js','./scripts/offline/net-policy.js','./scripts/offline/offline-manager.js','./scripts/offline/track-resolver.js','./scripts/offline/update-checker.js'];
// INTEL_ASSETS убраны из precache: это no-op заглушки, попадут в RUNTIME_CACHE при первом import.
// Экономия: ~27 запросов к bucket на каждый SW install.
const STATIC_ASSETS = [...CORE_ASSETS, ...PROFILE_ASSETS, ...ANALYTICS_ASSETS, ...UI_ASSETS];

const norm = u => { try { const p = new URL(u, self.registration.scope); p.hash = ''; p.search = ''; if (p.pathname.endsWith('/')) p.pathname += 'index.html'; return p.href; } catch { return String(u); } };
const STATIC_SET = new Set([...new Set(STATIC_ASSETS)].map(norm));

self.addEventListener('install', e => e.waitUntil((async () => {
  const c = await caches.open(CORE_CACHE);
  let loaded = 0;
  const total = STATIC_ASSETS.length;
  const notify = p => self.clients.matchAll({ includeUncontrolled: true }).then(cls => cls.forEach(cl => cl.postMessage({ type: 'CACHE_PROGRESS', percent: p })));
  
  await notify(5);
  await Promise.all(STATIC_ASSETS.map(async u => { 
    try { 
      const req = new Request(norm(u), { cache: 'no-cache' }); 
      const res = await fetch(req); 
      if (res.ok && !res.redirected) await c.put(req, res.clone()); 
    } catch {}
    loaded++;
    if (loaded % 4 === 0 || loaded === total) await notify(Math.round((loaded / total) * 100));
  }));
})()));

self.addEventListener('activate', e => e.waitUntil((async () => {
  const keep = new Set([CORE_CACHE, RUNTIME_CACHE, MEDIA_CACHE, OFFLINE_CACHE, META_CACHE]);
  const keys = await caches.keys();
  // Безопасно удаляем только старые версии кэшей кода, текущие остаются
  await Promise.all(keys.map(n => keep.has(n) ? Promise.resolve() : caches.delete(n)));
  await self.clients.claim(); // Мгновенно берём контроль над текущей вкладкой
  (await self.clients.matchAll({ type: 'window', includeUncontrolled: true })).forEach(c => c.postMessage({ type: 'SW_VERSION', version: SW_VERSION }));
})()));

self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url), isSilenceFile = url.pathname.endsWith('/audio/silence.mp3');

  if (url.origin === self.location.origin && url.pathname.startsWith('/Games/')) return;

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

self.addEventListener('push', e => {
  let data = {};
  try { data = e.data?.json?.() || {}; } catch {
    try { data = JSON.parse(e.data?.text?.() || '{}'); } catch {}
  }

  const kind = String(data.kind || '');
  const title = String(data.title || 'Витрина Разбита');
  const body = String(data.body || data.text || 'Новое уведомление');
  const url = String(data.url || './');
  const actions = kind === 'CHAT_MESSAGE'
    ? [
      { action: 'read', title: 'Прочитать' },
      { action: 'later', title: 'Позже' }
    ]
    : [];

  e.waitUntil(self.registration.showNotification(title, {
    body,
    icon: './icons/icon-192.png',
    badge: './icons/favicon-32.png',
    tag: String(data.tag || `vi3-${Date.now()}`),
    data: {
      url,
      kind,
      fromFriendId: String(data.fromFriendId || ''),
      gameId: String(data.gameId || ''),
      roomId: String(data.roomId || '')
    },
    actions,
    renotify: true,
    silent: false,
    vibrate: [200, 100, 200],
    timestamp: Date.now(),
    requireInteraction: data.requireInteraction === true || kind === 'CHAT_MESSAGE' || kind === 'GAME_INVITE'
  }));
});

self.addEventListener('notificationclick', e => {
  if (e.action === 'later') {
    e.notification.close();
    return;
  }

  e.notification.close();

  const data = e.notification?.data || {};
  const target = new URL(data.url || './', self.registration.scope);
  if (data.kind === 'CHAT_MESSAGE' && data.fromFriendId) {
    target.searchParams.set('openFriends', '1');
    target.searchParams.set('chatWith', data.fromFriendId);
  }

  const targetUrl = target.href;

  e.waitUntil((async () => {
    const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = clientsList.find(c => c.url && new URL(c.url).origin === new URL(targetUrl).origin);
    if (existing) {
      await existing.focus();
      existing.postMessage({
        type: 'PUSH_NOTIFICATION_CLICK',
        url: targetUrl,
        kind: data.kind || '',
        fromFriendId: data.fromFriendId || ''
      });
      return;
    }
    await self.clients.openWindow(targetUrl);
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
