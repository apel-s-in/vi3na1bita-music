// scripts/app/playback-policy.js
// Политика формирования очереди (favoritesOnly + shuffle) без остановки плеера.
(function () {
  'use strict';

  const w = window, U = w.Utils;
  const LS_FAV_ONLY = 'favoritesOnlyMode';

  const trim = (v) => (U?.trimStr ? U.trimStr(v) : (String(v ?? '').trim() || null));
  const isSpecial = (k) => (U?.isSpecialAlbumKey ? U.isSpecialAlbumKey(k) : (String(k || '').startsWith('__')));

  const playingAlbumKey = () => w.AlbumsManager?.getPlayingAlbum?.() || null;

  const likedUidsForPlayingAlbum = () => {
    const a = playingAlbumKey();
    if (!a || a === w.SPECIAL_FAVORITES_KEY || isSpecial(a)) return [];
    const uids = w.FavoritesManager?.getLikedUidsForAlbum?.(a) || [];
    return Array.isArray(uids) ? uids.map(trim).filter(Boolean) : [];
  };

  const originalSnapshot = () => {
    const o = w.playerCore?.originalPlaylist || [];
    return Array.isArray(o) ? o.slice() : [];
  };

  const currentSnapshot = () => {
    const s = w.playerCore?.getPlaylistSnapshot?.() || [];
    return Array.isArray(s) ? s.slice() : [];
  };

  const buildFavOnlyFromOriginal = (original, likedUids) => {
    if (!original?.length || !likedUids?.length) return [];
    const set = new Set(likedUids);
    return original.filter(t => {
      const uid = trim(t?.uid);
      return uid && set.has(uid);
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

    if (album === w.SPECIAL_FAVORITES_KEY || isSpecial(album)) return void ensureAvailable();

    const favOnlyEnabled = U?.lsGetBool01 ? U.lsGetBool01(LS_FAV_ONLY, false) : (localStorage.getItem(LS_FAV_ONLY) === '1');
    if (!favOnlyEnabled) return void ensureAvailable();

    const likedUids = likedUidsForPlayingAlbum();
    if (!likedUids.length) {
      setFavOnlyModeUI(false);
      w.NotificationSystem?.info?.('Отметьте понравившийся трек ⭐');
      return void ensureAvailable();
    }

    const original = originalSnapshot();
    const current = currentSnapshot();

    const curTrack = pc.getCurrentTrack?.();
    const curUid = trim(curTrack?.uid);

    const target = buildFavOnlyFromOriginal(original, likedUids);
    if (!target.length) {
      setFavOnlyModeUI(false);
      w.NotificationSystem?.info?.('Отметьте понравившийся трек ⭐');
      return void ensureAvailable();
    }

    const repeat = !!pc.isRepeat?.();

    // Shuffle fast-path for favoritesChanged
    if (!!pc.isShuffle?.() && opts?.reason === 'favoritesChanged') {
      const d = opts?.changed || {};
      const changedAlbum = trim(d.albumKey);
      const changedUid = trim(d.uid);
      const liked = !!d.liked;

      if (changedAlbum === album && changedUid) {
        if (liked) {
          const inCurrent = current.some(t => trim(t?.uid) === changedUid);
          if (!inCurrent) {
            const add = target.find(t => trim(t?.uid) === changedUid) || null;
            if (add) {
              pc.appendToPlaylistTail?.([add]);
              ensureAvailable();
              return;
            }
          }
        } else if (!repeat) {
          if (pc.removeFromPlaylistTailIfNotPlayed?.({ uid: changedUid })) {
            ensureAvailable();
            return;
          }
        }
      }
    }

    // Unlike current handling (6.1), ignore if repeat on (6.3)
    if (!repeat && opts?.reason === 'favoritesChanged' && curUid) {
      const d = opts?.changed || {};
      const changedAlbum = trim(d.albumKey);
      const changedUid = trim(d.uid);
      const liked = !!d.liked;

      if (!liked && changedAlbum === album && changedUid === curUid && !likedUids.includes(changedUid)) {
        const filtered = target.filter(t => trim(t?.uid) !== changedUid);
        if (!filtered.length) {
          setFavOnlyModeUI(false);
          w.NotificationSystem?.info?.('Отметьте понравившийся трек ⭐');
          return void ensureAvailable();
        }

        pc.setPlaylist(filtered, 0, {}, { preserveOriginalPlaylist: true, preserveShuffleMode: true, resetHistory: false });
        pc.next();
        ensureAvailable();
        return;
      }
    }

    // Base: rebuild playlist to favorites-only, keep current uid if present
    const startIndex = curUid ? Math.max(0, findIndexByUid(target, curUid)) : 0;
    pc.setPlaylist(target, startIndex, {}, { preserveOriginalPlaylist: true, preserveShuffleMode: true, resetHistory: false });
    ensureAvailable();
  }

  w.PlaybackPolicy = { apply };
})();
