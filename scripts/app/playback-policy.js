// scripts/app/playback-policy.js
// Политика формирования очереди (favoritesOnly + shuffle) без остановки плеера.
// ✅ v2 UID-only: источник истины для ⭐ = playerCore.isFavorite(uid)
// ⚠️ Никаких stop()/play() здесь, только setPlaylist()/append/remove + next() в разрешённых правилах.

(function () {
  'use strict';

  const w = window, U = w.Utils;
  const LS_FAV_ONLY = 'favoritesOnlyMode';

  const trim = (v) => (U?.trimStr ? U.trimStr(v) : (String(v ?? '').trim() || null));
  const isSpecial = (k) => (U?.isSpecialAlbumKey ? U.isSpecialAlbumKey(k) : (String(k || '').startsWith('__')));

  const playingAlbumKey = () => w.AlbumsManager?.getPlayingAlbum?.() || null;

  const originalSnapshot = () => {
    const o = w.playerCore?.originalPlaylist || [];
    return Array.isArray(o) ? o.slice() : [];
  };

  const currentSnapshot = () => {
    const s = w.playerCore?.getPlaylistSnapshot?.() || [];
    return Array.isArray(s) ? s.slice() : [];
  };

  const isLikedUid = (uid) => {
    const u = trim(uid);
    if (!u) return false;
    return !!w.playerCore?.isFavorite?.(u);
  };

  const buildFavOnlyFromOriginal = (original) => {
    if (!original?.length) return [];
    return original.filter((t) => {
      const uid = trim(t?.uid);
      return uid && isLikedUid(uid);
    });
  };

  const findIndexByUid = (list, uid) => {
    const u = trim(uid);
    if (!u || !Array.isArray(list)) return -1;
    return list.findIndex(t => trim(t?.uid) === u);
  };

  const setFavOnlyModeUI = (enabled) => {
    const btn = document.getElementById('favorites-btn');
    const icon = document.getElementById('favorites-btn-icon');
    if (!btn || !icon) return;
    btn.classList.toggle('favorites-active', !!enabled);
    icon.src = enabled ? 'img/star.png' : 'img/star2.png';
    U?.lsSetBool01 ? U.lsSetBool01(LS_FAV_ONLY, !!enabled) : (function(){ try{ localStorage.setItem(LS_FAV_ONLY, enabled ? '1':'0'); } catch {} })();
  };

  const ensureAvailable = () => {
    try { w.PlayerUI?.updateAvailableTracksForPlayback?.(); } catch {}
  };

  /**
   * opts:
   * - reason: 'toggle' | 'favoritesChanged' | 'init'
   * - changed: { albumKey, uid, liked }
   */
  function apply(opts = {}) {
    const pc = w.playerCore;
    if (!pc) return;

    const album = playingAlbumKey();
    if (!album) return;

    // В special альбомах policy не применяется (Избранное живёт по своим правилам).
    if (album === w.SPECIAL_FAVORITES_KEY || isSpecial(album)) return void ensureAvailable();

    const favOnlyEnabled = U?.lsGetBool01 ? U.lsGetBool01(LS_FAV_ONLY, false) : (localStorage.getItem(LS_FAV_ONLY) === '1');
    if (!favOnlyEnabled) return void ensureAvailable();

    const original = originalSnapshot();
    const current = currentSnapshot();

    const curTrack = pc.getCurrentTrack?.();
    const curUid = trim(curTrack?.uid);

    const target = buildFavOnlyFromOriginal(original);
    if (!target.length) {
      setFavOnlyModeUI(false);
      w.NotificationSystem?.info?.('Отметьте понравившийся трек ⭐');
      return void ensureAvailable();
    }

    const repeat = !!pc.isRepeat?.();

    // Shuffle fast-path for favoritesChanged
    if (!!pc.isShuffle?.() && opts?.reason === 'favoritesChanged') {
      const d = opts?.changed || {};
      const changedUid = trim(d.uid);
      const liked = !!d.liked;

      // Если лайкнули трек текущего playing альбома => добавим в хвост (если его там нет)
      if (changedUid && liked) {
        const inOriginal = original.some(t => trim(t?.uid) === changedUid);
        if (inOriginal) {
          const inCurrent = current.some(t => trim(t?.uid) === changedUid);
          if (!inCurrent) {
            const add = target.find(t => trim(t?.uid) === changedUid) || null;
            if (add) {
              pc.appendToPlaylistTail?.([add]);
              ensureAvailable();
              return;
            }
          }
        }
      }

      // Если анлайкнули НЕ текущий и repeat off => можно убрать из хвоста если ещё не проигран
      if (changedUid && !liked && !repeat) {
        const removed = pc.removeFromPlaylistTailIfNotPlayed?.({ uid: changedUid });
        if (removed) {
          ensureAvailable();
          return;
        }
      }
    }

    // Unlike current handling: если сняли ⭐ с текущего, и repeat off => next()
    if (!repeat && opts?.reason === 'favoritesChanged' && curUid) {
      const d = opts?.changed || {};
      const changedUid = trim(d.uid);
      const liked = !!d.liked;

      if (changedUid === curUid && !liked) {
        const filtered = target.filter(t => trim(t?.uid) !== changedUid);
        if (!filtered.length) {
          setFavOnlyModeUI(false);
          w.NotificationSystem?.info?.('Отметьте понравившийся трек ⭐');
          return void ensureAvailable();
        }

        const shuffleOn = !!pc.isShuffle?.();

        pc.setPlaylist(filtered, 0, {}, { preserveOriginalPlaylist: true, preserveShuffleMode: true, resetHistory: false });

        if (shuffleOn) pc.shufflePlaylist?.();

        pc.next();
        ensureAvailable();
        return;
      }
    }

    // Base: rebuild playlist to favorites-only, keep current uid if present
    const startIndex = curUid ? Math.max(0, findIndexByUid(target, curUid)) : 0;

    const shuffleOn = !!pc.isShuffle?.();

    pc.setPlaylist(
      target,
      startIndex,
      {},
      {
        preserveOriginalPlaylist: true,
        preserveShuffleMode: true,
        resetHistory: false
      }
    );

    if (shuffleOn) pc.shufflePlaylist?.();

    ensureAvailable();
  }

  w.PlaybackPolicy = { apply };
})();
