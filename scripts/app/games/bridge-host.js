// UID.001_(Playback safety invariant)_(bridge не принимает playback-команды)_(Game iframe не может pause/stop/mute/seek/next/prev)
// UID.082_(Local truth vs external telemetry split)_(iframe получает только safe snapshot)_(OAuth token/raw event log/localStorage не передаются)
// UID.094_(No-paralysis rule)_(ошибка iframe не ломает приложение)_(bridge можно уничтожить без влияния на музыку)
// UID.095_(Ownership boundary)_(parent остаётся владельцем профиля/stat/auth/backup/player)_(game-app только читает snapshot)

const W = window;
const safe = v => String(v == null ? '' : v).trim();
const n = v => Number.isFinite(Number(v)) ? Number(v) : 0;

const buildSnapshot = ({ config = {} } = {}) => {
  const a = W.achievementEngine, ya = W.YandexAuth, t = W.playerCore?.getCurrentTrack?.(), live = W.liveStatsTracker?.getSnapshot?.() || {};
  const gcId = localStorage.getItem('intel:internal-user-id') || localStorage.getItem('deviceHash') || 'local';
  const unlocked = Object.keys(a?.unlocked || {}).length;
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
      streak: n(live.projectedStreak || live.streak || 0),
      totalListenSec: n(live.projectedTotalSec || 0)
    },
    player: {
      playing: !!W.playerCore?.isPlaying?.(),
      uid: safe(t?.uid || ''),
      title: safe(t?.title || ''),
      album: safe(t?.album || W.TrackRegistry?.getAlbumTitle?.(t?.sourceAlbum) || ''),
      cover: safe(t?.cover || '')
    }
  };
};

export const createGameBridgeHost = ({ iframe, config = {}, onState } = {}) => {
  const bridgeId = crypto.randomUUID();
  let alive = true;

  const send = (type, payload = {}) => {
    if (!alive || !iframe?.contentWindow) return false;
    try {
      iframe.contentWindow.postMessage({ kind: 'vitrina:game-host', bridgeId, type, payload }, '*');
      return true;
    } catch { return false; }
  };

  const sendSnapshot = () => send('GC_SNAPSHOT', buildSnapshot({ config }));

  const onMessage = e => {
    if (!alive || e.source !== iframe?.contentWindow) return;
    const d = e.data || {};
    if (d.kind !== 'vitrina:game' || d.bridgeId !== bridgeId) return;
    if (d.type === 'GC_READY' || d.type === 'GC_REQUEST_SNAPSHOT') sendSnapshot();

    if (d.type === 'GC_SAVE_DATA') {
      if (d.payload?.gameId && d.payload?.key) {
        const gcId = localStorage.getItem('intel:internal-user-id') || localStorage.getItem('deviceHash') || 'local';
        try {
          const root = JSON.parse(localStorage.getItem(`gc_data_${gcId}`) || '{}');
          root[`${d.payload.gameId}_${d.payload.key}`] = d.payload.data;
          localStorage.setItem(`gc_data_${gcId}`, JSON.stringify(root));
          sendSnapshot(); // Рассылаем всем клиентам обновление
        } catch {}
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
        if (track && track.sourceAlbum) {
          am.loadAlbum(track.sourceAlbum).then(() => {
            setTimeout(() => {
              const el = document.querySelector(`.track[data-uid="${CSS.escape(track.uid)}"]`);
              if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
          post('GC_INIT', { bridgeId, snapshot: buildSnapshot({ config }) });
          post('GC_RESTORE_GAME', { gameId, at: Date.now() });
          post('GC_SNAPSHOT', buildSnapshot({ config }));

          setTimeout(() => {
            post('GC_INIT', { bridgeId, snapshot: buildSnapshot({ config }) });
            post('GC_RESTORE_GAME', { gameId, at: Date.now() });
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
  ['achievements:updated', 'stats:updated', 'analytics:liveTick', 'yandex:auth:changed', 'player:play', 'player:pause', 'player:stop', 'player:trackChanged'].forEach(x => W.addEventListener(x, onHostUpdate));

  iframe.addEventListener('load', () => {
    send('GC_INIT', { bridgeId, snapshot: buildSnapshot({ config }) });
    sendSnapshot();
  }, { once: true });

  return {
    bridgeId,
    sendSnapshot,
    destroy() {
      alive = false;
      W.removeEventListener('message', onMessage);
      ['achievements:updated', 'stats:updated', 'analytics:liveTick', 'yandex:auth:changed', 'player:play', 'player:pause', 'player:stop', 'player:trackChanged'].forEach(x => W.removeEventListener(x, onHostUpdate));
    }
  };
};

export default { createGameBridgeHost };
