// scripts/app/playback-policy.js
// Единая политика формирования очереди/режимов (favoritesOnly + shuffle) без остановки плеера.

(function PlaybackPolicyModule() {
  'use strict';

  const w = window;

  function isSpecialAlbumKey(key) {
    return !!key && String(key).startsWith('__');
  }

  function getPlayingAlbumKey() {
    return w.AlbumsManager?.getPlayingAlbum?.() || null;
  }

  function getLikedUidsForPlayingAlbum() {
    const playingAlbum = getPlayingAlbumKey();
    if (!playingAlbum) return [];
    if (playingAlbum === w.SPECIAL_FAVORITES_KEY) return [];
    if (isSpecialAlbumKey(playingAlbum)) return [];

    const uids = w.FavoritesManager?.getLikedUidsForAlbum?.(playingAlbum) || [];
    return Array.isArray(uids) ? uids.map(x => String(x || '').trim()).filter(Boolean) : [];
  }

  function getOriginalPlaylistSnapshot() {
    const pc = w.playerCore;
    const original = pc?.originalPlaylist || [];
    return Array.isArray(original) ? original.slice() : [];
  }

  function getCurrentSnapshot() {
    const pc = w.playerCore;
    const snap = pc?.getPlaylistSnapshot?.() || [];
    return Array.isArray(snap) ? snap.slice() : [];
  }

  function buildFavoritesOnlyPlaylistFromOriginal(original, likedUids) {
    if (!Array.isArray(original) || original.length === 0) return [];
    if (!Array.isArray(likedUids) || likedUids.length === 0) return [];

    const set = new Set(likedUids);
    return original.filter(t => {
      const uid = String(t?.uid || '').trim();
      return uid && set.has(uid);
    });
  }

  function findTrackIndexByUid(list, uid) {
    const u = String(uid || '').trim();
    if (!Array.isArray(list) || !u) return -1;
    return list.findIndex(t => String(t?.uid || '').trim() === u);
  }

  function setFavoritesOnlyModeUI(enabled) {
    // UI состояние (кнопка в плеере)
    const btn = document.getElementById('favorites-btn');
    const icon = document.getElementById('favorites-btn-icon');
    if (!btn || !icon) return;

    btn.classList.toggle('favorites-active', !!enabled);
    icon.src = enabled ? 'img/star.png' : 'img/star2.png';

    try {
      localStorage.setItem('favoritesOnlyMode', enabled ? '1' : '0');
    } catch {}
  }

  function ensureAvailableIndicesForPlayback() {
    // Оставляем поддержку window.availableFavoriteIndices как “мягкий” fallback,
    // но основной механизм теперь — пересборка плейлиста через setPlaylist.
    try {
      if (w.PlayerUI && typeof w.PlayerUI.updateAvailableTracksForPlayback === 'function') {
        w.PlayerUI.updateAvailableTracksForPlayback();
      }
    } catch {}
  }

  /**
   * Применить политику очереди к текущему playingAlbum (НЕ к currentAlbum).
   * opts:
   * - reason: 'toggle' | 'favoritesChanged' | 'init'
   * - changed: { albumKey, uid, liked }
   */
  function apply(opts = {}) {
    const pc = w.playerCore;
    if (!pc) return;

    const playingAlbum = getPlayingAlbumKey();
    if (!playingAlbum) return;

    // В __favorites__ плейлист формируется отдельно AlbumsManager.ensureFavoritesPlayback.
    if (playingAlbum === w.SPECIAL_FAVORITES_KEY) {
      ensureAvailableIndicesForPlayback();
      return;
    }

    // Для спец-разделов (новости) не применяем политику.
    if (isSpecialAlbumKey(playingAlbum)) {
      ensureAvailableIndicesForPlayback();
      return;
    }

    const favoritesOnlyEnabled = (localStorage.getItem('favoritesOnlyMode') === '1');

    if (!favoritesOnlyEnabled) {
      // Режим выключен — ничего не перестраиваем.
      ensureAvailableIndicesForPlayback();
      return;
    }

    const likedUids = getLikedUidsForPlayingAlbum();

    // ✅ 6.5: если лайков 0 — выключаем режим и показываем тост
    if (likedUids.length === 0) {
      setFavoritesOnlyModeUI(false);
      w.NotificationSystem?.info('Отметьте понравившийся трек ⭐');
      ensureAvailableIndicesForPlayback();
      return;
    }

    const original = getOriginalPlaylistSnapshot();
    const current = getCurrentSnapshot();

    const currentTrack = pc.getCurrentTrack?.();
    const currentUid = String(currentTrack?.uid || '').trim() || null;

    const targetFavoritesPlaylist = buildFavoritesOnlyPlaylistFromOriginal(original, likedUids);

    if (targetFavoritesPlaylist.length === 0) {
      // Теоретически возможно, если uid не совпали с originalPlaylist
      setFavoritesOnlyModeUI(false);
      w.NotificationSystem?.info('Отметьте понравившийся трек ⭐');
      ensureAvailableIndicesForPlayback();
      return;
    }

    const isShuffle = !!pc.isShuffle?.();

    // ✅ Если shuffle включён, и пришёл лайк нового трека — добавляем в конец очереди
    // (6.2) без полного reshuffle.
    if (isShuffle && opts?.reason === 'favoritesChanged') {
      const d = opts?.changed || {};
      const changedAlbum = String(d.albumKey || '').trim();
      const changedUid = String(d.uid || '').trim();
      const liked = !!d.liked;

      // ✅ Like: добавить в хвост
      if (liked && changedAlbum === playingAlbum && changedUid) {
        const inCurrent = current.some(t => String(t?.uid || '').trim() === changedUid);
        if (!inCurrent) {
          const add = targetFavoritesPlaylist.find(t => String(t?.uid || '').trim() === changedUid) || null;
          if (add) {
            pc.appendToPlaylistTail?.([add]);
            ensureAvailableIndicesForPlayback();
            return;
          }
        }
      }

      // ✅ Unlike НЕ текущего: убрать из хвоста очереди, если ещё не проигран (умный режим)
      if (!liked && changedAlbum === playingAlbum && changedUid) {
        const repeat = !!pc.isRepeat?.();
        if (!repeat) {
          const removed = pc.removeFromPlaylistTailIfNotPlayed?.({ uid: changedUid });
          if (removed) {
            ensureAvailableIndicesForPlayback();
            return;
          }
        }
      }
    }

    // Если мы уже в favorites-only плейлисте (по составу) — проверим на “unlike current”
    // и применим 6.1: мгновенно перейти к следующему доступному.
    // ✅ 6.3: если repeat включён — игнорируем фильтр и продолжаем повторять.
    const repeat = !!pc.isRepeat?.();

    if (!repeat && opts?.reason === 'favoritesChanged' && currentUid) {
      const d = opts?.changed || {};
 const changedAlbum = String(d.albumKey || '').trim();
      const changedUid = String(d.uid || '').trim();
      const liked = !!d.liked;

      if (!liked && changedAlbum === playingAlbum && changedUid) {
        const stillLiked = likedUids.includes(changedUid);
        if (!stillLiked) {
          // Если текущий трек именно тот, который разлайкали — next().
          if (changedUid === currentUid) {
            // Перед next() убедимся, что наш плейлист актуален и текущий трек исключён.
            // Мы НЕ стопаем — просто “переключаемся”.
            const filtered = targetFavoritesPlaylist.filter(t => String(t?.uid || '').trim() !== changedUid);
            if (filtered.length === 0) {
              setFavoritesOnlyModeUI(false);
              w.NotificationSystem?.info('Отметьте понравившийся трек ⭐');
              ensureAvailableIndicesForPlayback();
              return;
            }

            // Пересобираем плейлист без текущего, сохраняя shuffleMode (если он был) и originalPlaylist.
            pc.setPlaylist(filtered, 0, {}, {
              preserveOriginalPlaylist: true,
              preserveShuffleMode: true,
              resetHistory: false
            });

            // next() в рамках нового плейлиста.
            pc.next();
            ensureAvailableIndicesForPlayback();
            return;
          }
        }
      }
    }

    // Базовый случай: привести текущий плейлист к favorites-only (из original).
    // Старт: если текущий трек есть в target — продолжаем с него, иначе с 0.
    let startIndex = 0;
    if (currentUid) {
      const idx = findTrackIndexByUid(targetFavoritesPlaylist, currentUid);
      startIndex = idx >= 0 ? idx : 0;
    }

    pc.setPlaylist(targetFavoritesPlaylist, startIndex, {}, {
      preserveOriginalPlaylist: true,
      preserveShuffleMode: true,
      resetHistory: false
    });

    // НЕ вызываем play() здесь: setPlaylist уже “мягко” сохраняет воспроизведение.
    ensureAvailableIndicesForPlayback();
  }

  w.PlaybackPolicy = {
    apply
  };
})();
