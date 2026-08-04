const SW_VERSION = '9.3.3';
const CORE_CACHE = `vitrina-core-v${SW_VERSION}`, RUNTIME_CACHE = `vitrina-runtime-v${SW_VERSION}`, MEDIA_CACHE = `vitrina-media-v${SW_VERSION}`, OFFLINE_CACHE = `vitrina-offline-v${SW_VERSION}`, META_CACHE = `vitrina-meta-v${SW_VERSION}`;
let isAirplaneMode = false;

const CORE_ASSETS = ['./','./index.html','./oauth-callback.html','./manifest.json','./albums.json','./audio/silence.mp3','./data/lyrics-index-v1.json','./data/track-profiles-index.json','./styles/base.css','./styles/ui-core.css','./styles/main.css','./styles/album-carousel.css','./styles/player.css','./styles/showcase.css','./styles/offline.css','./styles/profile.css','./styles/shards.css','./styles/games.css','./img/logo.png','./icons/ui-sprite.svg','./icons/favicon-32.png','./icons/favicon-16.png','./icons/apple-touch-icon.png','./scripts/vendor/howler.min.js','./scripts/core/bootstrap.js','./scripts/core/config.js','./scripts/core/utils.js','./scripts/core/app-activity.js','./scripts/core/cloud-usage-meter.js','./scripts/core/favorites-manager.js','./scripts/core/device-identity.js','./scripts/core/device-context.js','./scripts/core/device-profile.js','./scripts/core/device-linking.js','./scripts/core/yandex-auth.js','./scripts/core/social-session.js','./scripts/core/timezone-policy.js','./scripts/core/yandex-backup-v7.js','./src/PlayerCore.js','./src/player-core/media-session.js','./src/player-core/ios-audio-keeper.js'];
const PROFILE_ASSETS = ['./scripts/app/profile/view.js','./scripts/app/profile/model.js','./scripts/app/profile/render-shell.js','./scripts/app/profile/profile-tab-renderers.js','./scripts/app/profile/profile-tab-bindings.js','./scripts/app/profile/account-bindings.js','./scripts/app/profile/profile-render-kit.js','./scripts/app/profile/cloud-action-render-kit.js','./scripts/app/profile/account-benefits-view.js','./scripts/app/profile/account-timezone-view.js','./scripts/app/profile/account-devices-view.js','./scripts/app/profile/account-device-initialization.js','./scripts/app/profile/tab-strip-physics.js','./scripts/app/profile/actions-trash.js','./scripts/app/profile/actions.js','./scripts/app/profile/live-bindings.js','./scripts/app/profile/stats-view.js','./scripts/app/profile/recs-view.js','./scripts/app/profile/logs-formatters.js','./scripts/app/profile/logs-view.js','./scripts/app/profile/yandex-actions.js','./scripts/app/profile/backup-info-modal.js','./scripts/app/profile/account-cloud-renderers.js','./scripts/app/profile/yandex-auth-view.js','./scripts/app/profile/achievements-view.js','./scripts/app/profile/loyalty-card.js','./scripts/app/profile/carousel-flat.js','./scripts/app/profile/template.js','./scripts/app/profile/settings-download-section.js','./scripts/app/profile/settings-interface-section.js','./scripts/app/profile/settings-trash-section.js','./scripts/app/profile/settings-data-section.js','./scripts/app/profile/settings-console-section.js','./scripts/app/profile/settings-view.js'];
const ANALYTICS_ASSETS = ['./scripts/analytics/account-data-boundary.js','./scripts/analytics/snapshot-contract.js','./scripts/analytics/device-settings-contract.js','./scripts/analytics/backup-v7-range.js','./scripts/analytics/backup-v7-sync.js','./scripts/analytics/backup-v7-recovery.js','./scripts/analytics/backup-domain-state.js','./scripts/analytics/stats-shard-contract.js','./scripts/analytics/stats-v4-projection.js','./scripts/analytics/event-integrity.js','./scripts/analytics/event-contract.js','./scripts/analytics/achievement-state.js','./scripts/analytics/stats-state.js','./scripts/analytics/confirmed-listening-stats.js','./scripts/analytics/loyalty-state.js','./scripts/analytics/sync-revisions.js','./scripts/analytics/sync-dirty-events.js','./scripts/analytics/backup-event-cleanup.js','./scripts/analytics/backup-scheduler-policy.js','./scripts/analytics/backup-coordinator-client.js','./scripts/analytics/backup-sync-engine.js','./scripts/analytics/favorite-state-contract.js','./scripts/analytics/device-registry.js','./scripts/analytics/meta-db.js','./scripts/analytics/event-logger.js','./scripts/analytics/session-tracker.js','./scripts/analytics/playback-fence.js','./scripts/analytics/listening-receipts.js','./scripts/analytics/playback-ownership.js','./scripts/analytics/favorite-mirror.js','./scripts/analytics/stats-aggregator.js','./scripts/analytics/achievement-engine.js','./scripts/analytics/achievements-dict.js','./scripts/analytics/live-stats.js','./scripts/analytics/playback-runtime.js','./scripts/analytics/playback-validity.js','./scripts/analytics/temporal-buckets.js','./scripts/analytics/share-generator.js'];
const UI_ASSETS = ['./scripts/ui/icon-utils.js','./scripts/ui/notify.js','./scripts/ui/sleep-timer.js','./scripts/ui/lyrics-modal.js','./scripts/ui/sysinfo.js','./scripts/ui/modals.js','./scripts/ui/offline-modal.js','./scripts/ui/offline-indicators.js','./scripts/ui/cache-progress-overlay.js','./scripts/ui/track-statistics-modal.js','./scripts/ui/statistics-modal.js','./scripts/ui/progress-formatters.js','./scripts/ui/logo-pulse.js','./scripts/ui/news-inline.js','./scripts/ui/app-modals.js','./scripts/app/gallery.js','./scripts/app/gallery-recommendation-cards.js','./scripts/app/player/favorites-only-resolver.js','./scripts/app/player/favorites-only-actions.js','./scripts/app/player/playback-context-source.js','./scripts/app/player/playback-clock.js','./scripts/app/playback-return-ui.js','./scripts/app/player-ui.js','./scripts/app/player-ui/lyrics.js','./scripts/app/albums.js','./scripts/app/albums/specials.js','./scripts/app/albums/album-carousel.js','./scripts/app/albums/album-icons-renderer.js','./scripts/app/albums/album-track-renderer.js','./scripts/app/albums/album-playback-builder.js','./scripts/app/albums/album-track-actions.js','./scripts/app/friends/friends-block.js','./scripts/app/shards/wallet-service.js','./scripts/app/shards/reward-notifier.js','./scripts/app/shards/view.js','./scripts/app/games/config.js','./scripts/app/games/host.js','./scripts/app/games/bridge-host.js','./scripts/app/track-registry.js','./scripts/app/offline-ui-bootstrap.js','./scripts/app/playback-cache-bootstrap.js','./scripts/app/showcase/index.js','./scripts/app/showcase/actions.js','./scripts/app/showcase/edit.js','./scripts/app/showcase/lyrics-search.js','./scripts/app/showcase/modals.js','./scripts/app/showcase/playlists.js','./scripts/app/showcase/render.js','./scripts/app/showcase/search.js','./scripts/app/showcase/store.js','./scripts/app/promocode.js','./scripts/app/pwa-install.js','./scripts/app/push/web-push.js','./scripts/app/push/loyalty-reminders.js','./scripts/app.js','./scripts/offline/cache-db.js','./scripts/offline/net-policy.js','./scripts/offline/offline-manager.js','./scripts/offline/track-resolver.js','./scripts/offline/update-checker.js'];
// INTEL загружается лениво и сохраняется в runtime cache.
// Основное воспроизведение и offline shell не зависят от INTEL.
const STATIC_ASSETS = [...CORE_ASSETS, ...PROFILE_ASSETS, ...ANALYTICS_ASSETS, ...UI_ASSETS];

const norm = u => { try { const p = new URL(u, self.registration.scope); p.hash = ''; p.search = ''; if (p.pathname.endsWith('/')) p.pathname += 'index.html'; return p.href; } catch { return String(u); } };
const STATIC_SET = new Set([...new Set(STATIC_ASSETS)].map(norm));
const yandexHost = host => String(host || '').endsWith('yandexcloud.net');
const sha256Key = async value => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value || '')));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 32);
};
const notifyCloudFetch = async ({ request, response, type, startedAt = 0 }) => {
  const url = new URL(request.url);
  if (!yandexHost(url.hostname)) return;
  const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  if (!clientsList.length) return;
  const correlationKey = request.headers.get('x-vi3-correlation') || '';
  const resourceKey = await sha256Key(url.href);
  const message = {
    type,
    correlationKey,
    resourceKey,
    host: url.host,
    method: request.method,
    status: Number(response?.status || 0),
    responseBytes: Number(response?.headers?.get('content-length') || 0),
    durationMs: startedAt ? Math.max(0, Date.now() - startedAt) : 0
  };
  clientsList.forEach(client => client.postMessage(message));
};

self.addEventListener('install', e => e.waitUntil((async () => {
  const cache = await caches.open(CORE_CACHE);
  const assets = [...new Set(STATIC_ASSETS)];
  const total = assets.length;
  const concurrency = Math.min(6, total);
  let cursor = 0;
  let loaded = 0;
  let lastPercent = 0;

  const notify = percent =>
    self.clients.matchAll({ includeUncontrolled: true })
      .then(clients => clients.forEach(client =>
        client.postMessage({ type: 'CACHE_PROGRESS', percent })
      ));

  const worker = async () => {
    while (cursor < total) {
      const index = cursor++;
      const url = assets[index];

      try {
        const request = new Request(norm(url), { cache: 'no-cache' });
        const response = await fetch(request);
        if (response.ok && !response.redirected) {
          await cache.put(request, response.clone());
        }
      } catch {}

      loaded++;
      const percent = Math.round((loaded / total) * 100);
      if (percent >= lastPercent + 4 || loaded === total) {
        lastPercent = percent;
        await notify(percent);
      }
    }
  };

  await notify(5);
  await Promise.all(Array.from({ length: concurrency }, worker));
})()));

self.addEventListener('activate', e => e.waitUntil((async () => {
  const keep = new Set([CORE_CACHE, RUNTIME_CACHE, MEDIA_CACHE, OFFLINE_CACHE, META_CACHE]);
  const keys = await caches.keys();
  // Удаляем только старые кэши этого приложения; чужие Cache Storage не затрагиваем.
  await Promise.all(keys.map(name =>
    name.startsWith('vitrina-') && !keep.has(name)
      ? caches.delete(name)
      : Promise.resolve(false)
  ));
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
      if (cached) {
        e.waitUntil(notifyCloudFetch({ request: req, response: cached, type: 'YANDEX_CACHE_HIT' }));
        return cached;
      }
      const startedAt = Date.now();
      const res = await fetch(req);
      if (res.ok) await c.put(req, res.clone());
      e.waitUntil(notifyCloudFetch({ request: req, response: res, type: 'YANDEX_NETWORK_FETCH', startedAt }));
      return res;
    })());
    if (url.pathname.endsWith('.json')) return e.respondWith((async () => {
      const c = await caches.open(RUNTIME_CACHE), cached = await c.match(req);
      const fetchPromise = (async () => {
        const startedAt = Date.now();
        try {
          const res = await fetch(req);
          if (res.ok) await c.put(req, res.clone());
          e.waitUntil(notifyCloudFetch({ request: req, response: res, type: 'YANDEX_NETWORK_FETCH', startedAt }));
          return res;
        } catch {
          return cached;
        }
      })();
      if (cached) {
        e.waitUntil(notifyCloudFetch({ request: req, response: cached, type: 'YANDEX_CACHE_HIT' }));
        fetchPromise.catch(() => null);
        return cached;
      }
      return fetchPromise;
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
  if (kind === 'PLAYBACK_TRANSFERRED') {
    e.waitUntil((async () => {
      const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      clientsList.forEach(client => client.postMessage({
        type: 'PLAYBACK_OWNERSHIP_TRANSFERRED',
        kind,
        logicalSessionId: String(data.logicalSessionId || ''),
        ownerDeviceId: String(data.ownerDeviceId || ''),
        ownerLabel: String(data.ownerLabel || ''),
        ownerEpoch: Number(data.ownerEpoch || 0)
      }));
      await self.registration.showNotification(String(data.title || 'Воспроизведение передано'), {
        body: String(data.body || 'Музыка продолжена на другом устройстве.'),
        icon: './icons/icon-192.png',
        badge: './icons/favicon-32.png',
        tag: String(data.tag || 'playback-transferred'),
        data: { url: String(data.url || './'), kind },
        renotify: false,
        silent: true,
        requireInteraction: false,
        timestamp: Date.now()
      });
    })());
    return;
  }
  const title = String(data.title || 'Витрина Разбита');
  const body = String(data.body || data.text || 'Новое уведомление');
  const url = String(data.url || './');
  const actions = kind === 'CHAT_MESSAGE'
    ? [
      { action: 'read', title: 'Прочитать' },
      { action: 'later', title: 'Позже' }
    ]
    : (kind === 'VOICE_CALL'
      ? [
        { action: 'answer', title: 'Ответить' },
        { action: 'later', title: 'Отклонить' }
      ]
      : []);

  e.waitUntil((async () => {
    const message = {
      type: 'PUSH_NOTIFICATION_RECEIVED',
      kind,
      fromFriendId: String(data.fromFriendId || ''),
      gameId: String(data.gameId || ''),
      msgId: String(data.msgId || ''),
      callId: String(data.callId || ''),
      createdAt: Number(data.createdAt || Date.now())
    };
    const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    clientsList.forEach(client => client.postMessage(message));
    await self.registration.showNotification(title, {
      body,
      icon: './icons/icon-192.png',
      badge: './icons/favicon-32.png',
      tag: String(data.tag || `vi3-${Date.now()}`),
      data: {
        url,
        kind,
        fromFriendId: message.fromFriendId,
        gameId: message.gameId,
        msgId: message.msgId,
        callId: message.callId
      },
      actions,
      renotify: true,
      silent: false,
      vibrate: [200, 100, 200],
      timestamp: Date.now(),
      requireInteraction:
        data.requireInteraction === true ||
        kind === 'CHAT_MESSAGE' ||
        kind === 'GAME_INVITE' ||
        kind === 'VOICE_CALL' ||
        kind === 'LOYALTY_VACATION_ENDED'
    });
  })());
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

  if (data.kind === 'VOICE_CALL') {
    target.searchParams.set('openFriends', '1');
    if (data.fromFriendId) target.searchParams.set('voiceWith', data.fromFriendId);
    if (data.callId) target.searchParams.set('callId', data.callId);
  }
  if (
    [
      'LOYALTY_REMINDER',
      'LOYALTY_VACATION_ENDING',
      'LOYALTY_VACATION_ENDED'
    ].includes(data.kind)
  ) {
    target.searchParams.set('openLoyalty', '1');
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
        fromFriendId: data.fromFriendId || '',
        msgId: data.msgId || '',
        callId: data.callId || ''
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
  else if (d.type === 'CLEAR_CACHE') e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(name => name.startsWith('vitrina-')).map(name => caches.delete(name)))
    )
  );
  else if (d.type === 'GET_CACHE_SIZE' && p) e.waitUntil((async () => {
    let s = 0, n = 0;
    try { for (const k of await caches.keys()) { const c = await caches.open(k), reqs = await c.keys(); n += reqs.length; for (const r of reqs) { const res = await c.match(r); if (res) s += parseInt(res.headers.get('content-length') || 0, 10); } } } catch {}
    p.postMessage({ size: s, entries: n, approx: true });
  })());
});
