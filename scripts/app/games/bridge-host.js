// UID.001_(Playback safety invariant)_(bridge не принимает playback-команды)_(Game iframe не может pause/stop/mute/seek/next/prev)
// UID.082_(Local truth vs external telemetry split)_(iframe получает только safe snapshot)_(OAuth token/raw event log/localStorage не передаются)
// UID.094_(No-paralysis rule)_(ошибка iframe не ломает приложение)_(bridge можно уничтожить без влияния на музыку)
// UID.095_(Ownership boundary)_(parent остаётся владельцем профиля/stat/auth/backup/player)_(game-app только читает snapshot)

const W = window;
const safe = v => String(v == null ? '' : v).trim();
const n = v => Number.isFinite(Number(v)) ? Number(v) : 0;

const buildSnapshot = ({ config = {} } = {}) => {
  const a = W.achievementEngine, ya = W.YandexAuth, t = W.playerCore?.getCurrentTrack?.(), live = W.liveStatsTracker?.getSnapshot?.() || {};
  const unlocked = Object.keys(a?.unlocked || {}).length;
  const total = Array.isArray(a?.achievements) ? a.achievements.length : 0;
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
      displayName: safe(ya?.getProfile?.()?.displayName || ya?.getProfile?.()?.login || 'Слушатель'),
      avatar: safe(ya?.getProfile?.()?.avatar || ''),
      authStatus: safe(ya?.getSessionStatus?.() || 'logged_out'),
      yandexLinked: ya?.getSessionStatus?.() === 'active',
      diskAccess: !!ya?.hasDiskAccess?.()
    },
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
