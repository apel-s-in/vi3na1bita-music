// UID.001_(Playback safety invariant)_(bridge не принимает playback-команды)_(Game iframe не может pause/stop/mute/seek/next/prev)
// UID.082_(Local truth vs external telemetry split)_(iframe получает только safe snapshot)_(OAuth token/raw event log/localStorage не передаются)
// UID.094_(No-paralysis rule)_(ошибка iframe не ломает приложение)_(bridge можно уничтожить без влияния на музыку)
// UID.095_(Ownership boundary)_(parent остаётся владельцем профиля/stat/auth/backup/player)_(game-app только читает snapshot)
import { requestSocialAction } from '../../core/social-session.js';
import { getConfirmedListeningStats } from '../../analytics/confirmed-listening-stats.js';
import { getLoyaltyState } from '../../analytics/loyalty-state.js';
import {
  getEmbeddedFriendsRpcMethod
} from 'https://vi3na1bita.website.yandexcloud.net/Friends/embedded-rpc-contract.js?v=9.1.6';
const W = window;
const safe = v => String(v == null ? '' : v).trim();
const n = v => Number.isFinite(Number(v)) ? Number(v) : 0;
const GAME_SIGNALING_SCOPES = Object.freeze({
  tower: new Set([
    'player_register',
    'presence_heartbeat',
    'friend_status_check',
    'presence_batch',
    'friend_list',
    'profile_get',
    'rtc_config',
    'leaderboard_v2_get'
  ]),
  war_hearts: new Set([
    'player_register',
    'presence_heartbeat',
    'friend_status_check',
    'profile_get',
    'rtc_config',
    'room_create',
    'room_join',
    'room_join_token_create',
    'room_join_token_redeem',
    'room_get',
    'room_close',
    'room_set_mode',
    'ranked_match_prepare',
    'ranked_stake_prepare',
    'ranked_rps_commit',
    'ranked_rps_reveal',
    'ranked_match_submit',
    'ranked_match_status',
    'ranked_match_abort',
    'leaderboard_v2_get',
    'signal_send',
    'signal_poll',
    'signal_ack',
    'push_send',
    'nearby_game_create',
    'nearby_game_join',
    'lan_code_register',
    'lan_code_resolve'
  ])
});

const GAME_SAVE_LIMITS = Object.freeze({
  war_hearts: Object.freeze({
    matchDraft: 192 * 1024,
    matchHistory: 96 * 1024,
    presets: 48 * 1024,
    uiSettings: 16 * 1024
  })
});

const GAME_HOST_SYNC_EVENTS = Object.freeze([
  'achievements:updated',
  'stats:updated',
  'analytics:liveTick',
  'yandex:auth:changed',
  'shards:wallet-updated',
  'player:play',
  'player:pause',
  'player:stop',
  'player:trackChanged',
  'player:transportReloaded',
  'playlist:changed',
  'quality:changed'
]);

const validateGameSave = payload => {
  const gameId = safe(payload?.gameId);
  const key = safe(payload?.key);
  const limit = GAME_SAVE_LIMITS[gameId]?.[key];

  if (!limit) {
    throw new Error('game_save_key_forbidden');
  }

  const text = JSON.stringify(payload?.data ?? null);

  if (text.length > limit) {
    throw new Error('game_save_payload_too_large');
  }

  return {
    gameId,
    key,
    data: JSON.parse(text)
  };
};
const normalizeRpcPayload = payload => {
  const data = payload && typeof payload === 'object'
    ? payload
    : {};

  const text = JSON.stringify(data);
  if (text.length > 65536) {
    throw new Error('game_rpc_payload_too_large');
  }

  return JSON.parse(text);
};
const confirmEmbeddedFriendsAction = descriptor =>
  new Promise(resolve => {
    const confirmation = descriptor?.confirmation;

    if (!descriptor?.dangerous || !confirmation) {
      resolve(true);
      return;
    }

    if (!W.Modals?.confirm) {
      resolve(false);
      return;
    }

    let settled = false;
    const finish = value => {
      if (settled) return;
      settled = true;
      resolve(!!value);
    };

    W.Modals.confirm({
      title: safe(confirmation.title || 'Подтвердите действие'),
      textHtml:
        W.Utils?.escapeHtml?.(
          confirmation.text ||
          'Это действие изменит данные Friends.'
        ) ||
        safe(confirmation.text),
      confirmText: safe(
        confirmation.confirmText ||
        'Продолжить'
      ),
      cancelText: 'Отмена',
      onConfirm: () => finish(true),
      onCancel: () => finish(false),
      onClose: () => finish(false)
    });
  });
const buildSnapshot = ({ config = {} } = {}) => {
  const a = W.achievementEngine, ya = W.YandexAuth, t = W.playerCore?.getCurrentTrack?.(), confirmed = getConfirmedListeningStats(), loyalty = getLoyaltyState();
  const gcId = localStorage.getItem('intel:internal-user-id') || localStorage.getItem('deviceHash') || 'local';
  const unlocked = a?.getCompletedCount?.() ??
    Object.keys(a?.unlocked || {}).length;
  const total = Array.isArray(a?.achievements) ? a.achievements.length : 0;
  let gameData = {};
  try { gameData = JSON.parse(localStorage.getItem(`gc_data_${gcId}`) || '{}'); } catch {}
  return {
    kind: 'GC_SNAPSHOT',
    app: {
      version: safe(W.APP_CONFIG?.APP_VERSION || W.VERSION || ''),
      buildDate: safe(W.APP_CONFIG?.BUILD_DATE || W.BUILD_DATE || ''),
      bridgeVersion: n(config.bridgeVersion || 1)
    },
    gate: {
      status: safe(config.status || 'off'),
      enterEnabled: !!config.enterEnabled,
      revision: safe(config.revision || '')
    },
    friend: W.__vfIdentity || null,
    user: {
      gcAccountId: gcId,
      displayName: safe(ya?.getProfile?.()?.displayName || ya?.getProfile?.()?.login || 'Слушатель'),
      avatar: safe(ya?.getProfile?.()?.avatar || ''),
      authStatus: safe(ya?.getSessionStatus?.() || 'logged_out'),
      yandexLinked: ya?.getSessionStatus?.() === 'active',
      diskAccess: !!ya?.hasDiskAccess?.()
    },
    gameData,
    progress: {
      level: n(a?.profile?.level || 1),
      xp: n(a?.profile?.xp || 0),
      achievementsUnlocked: unlocked,
      achievementsTotal: total,
      streak: loyalty.available
        ? n(loyalty.currentDays)
        : 0,
      totalListenSec: confirmed.available
        ? Math.floor(n(confirmed.totalListenMs) / 1000)
        : 0
    },
    wallet: W.ShardWallet?.getSnapshot?.() || {
      available: false,
      shards: 0,
      locked: 0,
      spendable: 0,
      version: 0
    },
    player: {
      playing: !!W.playerCore?.isPlaying?.(),
      uid: safe(t?.uid || ''),
      title: safe(t?.title || ''),
      album: safe(t?.album || W.TrackRegistry?.getAlbumTitle?.(t?.sourceAlbum) || ''),
      cover: safe(t?.cover || ''),
      position: Math.max(0, n(W.playerCore?.getPosition?.())),
      duration: Math.max(0, n(W.playerCore?.getDuration?.())),
      quality: safe(W.playerCore?.qMode || 'hi')
    }
  };
};

export const createGameBridgeHost = ({ iframe, config = {}, onState } = {}) => {
  const bridgeId = crypto.randomUUID();
  const activeFriendsRequests = new Set();

  const capabilities = Object.freeze({
    tower: crypto.randomUUID(),
    war_hearts: crypto.randomUUID()
  });

  const capabilityScopes = new Map([
    [capabilities.tower, 'tower'],
    [capabilities.war_hearts, 'war_hearts']
  ]);

  let alive = true;

  const getCapabilityScope = payload =>
    capabilityScopes.get(
      safe(payload?.capabilityToken)
    ) || '';

  const requireCapability = (
    payload,
    allowedScopes
  ) => {
    const scope = getCapabilityScope(payload);

    if (
      !scope ||
      !allowedScopes.includes(scope)
    ) {
      const error = new Error('game_capability_forbidden');
      error.status = 403;
      throw error;
    }

    return scope;
  };

  const makeInitPayload = (extra = {}) => ({
    bridgeId,
    snapshot: buildSnapshot({ config }),
    capabilities: {
      tower: capabilities.tower,
      games: {
        war_hearts: capabilities.war_hearts
      }
    },
    ...extra
  });

  const send = (type, payload = {}) => {
    if (!alive || !iframe?.contentWindow) return false;
    try {
      iframe.contentWindow.postMessage({ kind: 'vitrina:game-host', bridgeId, type, payload }, '*');
      return true;
    } catch { return false; }
  };

  const sendSnapshot = () => send('GC_SNAPSHOT', buildSnapshot({ config }));
  const handleFriendsRequest = async payload => {
    const requestId = safe(payload?.requestId);
    const method = safe(payload?.method);
    const descriptor = getEmbeddedFriendsRpcMethod(method);
    const capabilityScope = getCapabilityScope(payload);

    if (
      !requestId ||
      !descriptor ||
      !['tower', 'war_hearts'].includes(capabilityScope)
    ) {
      send('GC_FRIENDS_RESPONSE', {
        requestId,
        ok: false,
        status: 403,
        error: 'friends_rpc_method_forbidden'
      });
      return;
    }

    if (activeFriendsRequests.has(requestId)) {
      send('GC_FRIENDS_RESPONSE', {
        requestId,
        ok: false,
        status: 409,
        error: 'friends_rpc_request_duplicate'
      });
      return;
    }

    activeFriendsRequests.add(requestId);

    try {
      const args = normalizeRpcPayload(
        Array.isArray(payload?.args)
          ? payload.args
          : []
      );

      const module = await import(
        '../friends/friends-block.js'
      );
      const core = await module.getFriendsCoreService();

      if (!core?.isReady?.()) {
        throw new Error('friends_identity_required');
      }

      if (
        descriptor.dangerous &&
        !(await confirmEmbeddedFriendsAction(descriptor))
      ) {
        send('GC_FRIENDS_RESPONSE', {
          requestId,
          ok: false,
          status: 409,
          error: 'friends_rpc_confirmation_cancelled'
        });
        return;
      }

      let result;

      if (method === 'getEmbeddedIdentity') {
        result = {
          friendId: safe(core.identity?.friendId),
          displayName: safe(
            core.identity?.displayName ||
            'Слушатель'
          ),
          avatar: safe(core.identity?.avatar),
          yandexLinked: true
        };
      } else if (method === 'getEmbeddedWebPushEnabled') {
        result = module.getFriendsWebPushEnabled();
      } else if (method === 'enableEmbeddedWebPush') {
        result = await module.enableFriendsWebPush();
      } else if (method === 'setEmbeddedFriendsActive') {
        result = await module.setFriendsEmbeddedActive(
          args[0] || {}
        );
      } else {
        const fn = core[method];

        if (
          descriptor.route !== 'core' ||
          typeof fn !== 'function'
        ) {
          throw new Error('friends_rpc_method_missing');
        }

        result = await fn.apply(core, args);
      }

      send('GC_FRIENDS_RESPONSE', {
        requestId,
        ok: true,
        status: 200,
        result: result === undefined ? null : result
      });
    } catch (error) {
      send('GC_FRIENDS_RESPONSE', {
        requestId,
        ok: false,
        status: Number(error?.status || 500),
        error: safe(
          error?.message ||
          'friends_rpc_failed'
        )
      });
    } finally {
      activeFriendsRequests.delete(requestId);
    }
  };
  const handleSignalingRequest = async payload => {
    const requestId = safe(payload?.requestId);
    const action = safe(payload?.action);
    const scope = getCapabilityScope(payload);
    const allowed = GAME_SIGNALING_SCOPES[scope];

    if (
      !requestId ||
      !allowed?.has(action)
    ) {
      send('GC_SIGNALING_RESPONSE', {
        requestId,
        ok: false,
        status: 403,
        error: 'game_rpc_action_forbidden'
      });
      return;
    }

    try {
      const data = normalizeRpcPayload(payload?.data);
      const result = await requestSocialAction(action, data);

      if (
        action === 'ranked_stake_prepare' ||
        (
          action === 'ranked_match_status' &&
          ['paid', 'refunded'].includes(
            result?.match?.economy?.status
          )
        )
      ) {
        W.ShardWallet?.refresh?.({ force: true })
          .catch(() => null);
      }

      send('GC_SIGNALING_RESPONSE', {
        requestId,
        ok: true,
        status: 200,
        result
      });
    } catch (error) {
      send('GC_SIGNALING_RESPONSE', {
        requestId,
        ok: false,
        status: Number(error?.status || 500),
        error: safe(error?.message || 'game_rpc_failed')
      });
    }
  };

  const onMessage = e => {
    if (!alive || e.source !== iframe?.contentWindow) return;
    const d = e.data || {};
    if (d.kind !== 'vitrina:game' || d.bridgeId !== bridgeId) return;
    if (d.type === 'GC_SIGNALING_REQUEST') {
      handleSignalingRequest(d.payload || {});
      return;
    }

    if (d.type === 'GC_FRIENDS_REQUEST') {
      handleFriendsRequest(d.payload || {});
      return;
    }
    if (d.type === 'GC_READY' || d.type === 'GC_REQUEST_SNAPSHOT') sendSnapshot();

    if (d.type === 'GC_AUTH_LOGIN') {
      try {
        W.YandexAuth?.login?.();
      } catch {}
      return;
    }

    if (d.type === 'GC_SAVE_DATA') {
      try {
        requireCapability(
          d.payload,
          ['war_hearts']
        );

        const save = validateGameSave(d.payload);
        const gcId =
          localStorage.getItem('intel:internal-user-id') ||
          localStorage.getItem('deviceHash') ||
          'local';

        const storageKey = `gc_data_${gcId}`;
        const root = JSON.parse(
          localStorage.getItem(storageKey) || '{}'
        );

        root[`${save.gameId}_${save.key}`] = save.data;

        localStorage.setItem(
          storageKey,
          JSON.stringify(root)
        );

        sendSnapshot();

        W.dispatchEvent(new CustomEvent(
          'backup:domain-dirty',
          {
            detail: {
              domain: 'profile',
              immediate: true
            }
          }
        ));
      } catch (error) {
        console.warn(
          '[GameBridge] save rejected:',
          error?.message || error
        );
      }
      return;
    }

    if (d.type === 'GC_DOOR_CLICKED') {
      try {
        W.eventLogger?.log?.('FEATURE_USED', 'global', {
          feature: 'game_center_door',
          door: safe(d.payload?.door || ''),
          revision: safe(config.revision || '')
        });
      } catch {}
      return;
    }

    if (d.type === 'GC_PARENT_SCROLL') {
      const dy = Math.max(-160, Math.min(160, n(d.payload?.deltaY || 0)));
      if (dy) {
        try { W.scrollBy({ top: dy, left: 0, behavior: 'auto' }); } catch { W.scrollBy(0, dy); }
      }
      return;
    }

    if (d.type === 'GC_COLLAPSE_GAME') {
      const host = document.querySelector('.gc-host.is-mounted');
      if (host) {
        document.body.appendChild(host); // Спасаем iframe от уничтожения при рендере альбома
        host.dataset.gcCollapsed = '1';
        host.classList.add('is-gc-parked');
        host.style.display = '';
      }

      const pc = W.playerCore;
      const am = W.AlbumsManager;

      if (pc && am) {
        const track = pc.getCurrentTrack();

        if (track?.sourceAlbum) {
          am.loadAlbum(track.sourceAlbum).then(() => {
            setTimeout(() => {
              const el = document.querySelector(
                `.track[data-uid="${CSS.escape(track.uid)}"]`
              );
              el?.scrollIntoView({
                behavior: 'smooth',
                block: 'center'
              });
            }, 300);
          });
        }
      }

      let floater = document.getElementById('gc-floating-heart');
      if (!floater) {
        floater = document.createElement('div');
        floater.id = 'gc-floating-heart';
        floater.innerHTML = `
          <div class="gc-floating-pulse"></div>
          <img src="img/icon_game.png" class="gc-floating-img" alt="Разбитое сердце">
          <div class="gc-floating-text">ВЕРНИСЬ<br>В ИГРУ</div>
          <button class="gc-floating-close" aria-label="Закрыть игру">✕</button>
        `;
        document.body.appendChild(floater);

        const restore = () => {
          floater.remove();

          const savedHost = host || document.querySelector('.gc-host.is-mounted');
          if (!savedHost) return;

          savedHost.dataset.gcCollapsed = '0';
          savedHost.classList.remove('is-gc-parked');
          savedHost.hidden = false;
          savedHost.style.display = '';
          savedHost.classList.add('is-mounted');

          const frameWrap = savedHost.querySelector('#gc-frame-wrap, .gc-frame-wrap');
          if (frameWrap) {
            frameWrap.hidden = false;
            frameWrap.style.display = '';
          }

          const panel = savedHost.querySelector('.gc-panel');
          if (panel) {
            panel.hidden = true;
            panel.style.display = 'none';
          }

          const frame = savedHost.querySelector('.gc-frame');
          const gameId = d.payload?.gameId || 'war_hearts';
          const post = (type, payload = {}) => {
            try {
              frame?.contentWindow?.postMessage({ kind: 'vitrina:game-host', bridgeId, type, payload }, '*');
            } catch {}
          };

          // Re-handshake: если Safari/iOS выгрузил JS-state Башни, она заново получит bridgeId и gameId.
          post('GC_INIT', makeInitPayload({
            gameId
          }));
          post('GC_RESTORE_GAME', {
            gameId,
            at: Date.now()
          });
          post('GC_SNAPSHOT', buildSnapshot({ config }));

          setTimeout(() => {
            post('GC_INIT', makeInitPayload({
              gameId
            }));
            post('GC_RESTORE_GAME', {
              gameId,
              at: Date.now()
            });
            post('GC_SNAPSHOT', buildSnapshot({ config }));
          }, 160);
        };

        floater.querySelector('.gc-floating-img').onclick = restore;
        floater.querySelector('.gc-floating-text').onclick = restore;

        floater.querySelector('.gc-floating-close').onclick = (e) => {
          e.stopPropagation();
          W.Modals?.confirm?.({
            title: 'Выход из игры',
            textHtml: 'Сессия прервётся, и не законченные игры не принесут очки. Точно выйти?',
            confirmText: 'Выйти',
            cancelText: 'Отмена',
            onConfirm: () => {
              floater.remove();

              const savedHost = host || document.querySelector('.gc-host.is-mounted');
              if (savedHost) savedHost.remove();

              onState?.({ state: 'closed_by_game' });
            }
          });
        };
      }
      return;
    }

    if (d.type === 'GC_CLOSE') {
      try {
        W.eventLogger?.log?.('FEATURE_USED', 'global', {
          feature: 'game_center_close',
          revision: safe(config.revision || '')
        });
      } catch {}
      onState?.({ state: 'closed_by_game' });
    }
  };

  const onHostUpdate = () => send('GC_HOST_STATE', buildSnapshot({ config }));

  W.addEventListener('message', onMessage);
  GAME_HOST_SYNC_EVENTS.forEach(name =>
    W.addEventListener(name, onHostUpdate)
  );

  iframe.addEventListener('load', () => {
    send('GC_INIT', makeInitPayload());
    sendSnapshot();
  }, { once: true });

  return {
    bridgeId,
    sendSnapshot,
    destroy() {
      alive = false;
      activeFriendsRequests.clear();
      W.removeEventListener('message', onMessage);
      GAME_HOST_SYNC_EVENTS.forEach(name =>
        W.removeEventListener(name, onHostUpdate)
      );
    }
  };
};

export default { createGameBridgeHost };
