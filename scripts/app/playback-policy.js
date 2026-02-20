(function (W) {
  'use strict';

  const LS_KEY = 'favoritesOnlyMode';
  const FAV_KEY = W.SPECIAL_FAVORITES_KEY || '__favorites__';

  const pc = () => W.playerCore;
  const isOn = () => localStorage.getItem(LS_KEY) === '1';

  const uniqByUid = (list) => {
    const seen = new Set();
    return (list || []).filter(t => t?.uid && !seen.has(t.uid) && seen.add(t.uid));
  };

  const buildTarget = ({ core, playingAlbum, favoritesOnly }) => {
    const source = core?.originalPlaylist || [];
    if (!source.length) return null;

    // ТЗ: если playing = Избранное — playback всегда только по active (inactive никогда не участвуют)
    if (playingAlbum === FAV_KEY) {
      return uniqByUid(source).filter((t) => core.isFavorite?.(t.uid));
    }

    // F=OFF: не фильтруем
    if (!favoritesOnly) return uniqByUid(source);

    // F=ON: только ⭐ в текущем playing альбоме
    const liked = new Set(core.getLikedUidsForAlbum?.(playingAlbum) || []);
    return uniqByUid(source).filter((t) => t?.uid && liked.has(t.uid));
  };

  const pickIndex = ({ core, target }) => {
    const curUid = String(core?.getCurrentTrack?.()?.uid || '').trim();
    if (!curUid) return 0;
    const idx = target.findIndex((t) => String(t?.uid || '').trim() === curUid);
    return idx >= 0 ? idx : 0;
  };

  const apply = () => {
    const core = pc();
    if (!core) return;

    const playingAlbum = W.AlbumsManager?.getPlayingAlbum?.();
    if (!playingAlbum) return;

    // F включается/выключается UI-ом. Здесь только применяем политику к playing.
    const favoritesOnly = isOn();

    // Нельзя применять если нет контекста/текущего трека
    const source = core.originalPlaylist || [];
    if (!source.length || core.getIndex() < 0) return;

    const target = buildTarget({ core, playingAlbum, favoritesOnly });
    if (!target || !target.length) {
      // Важное правило ТЗ: если ⭐ нет — F не включается (UI уже делает toast и не ставит LS).
      // Здесь просто ничего не ломаем.
      return;
    }

    const newIdx = pickIndex({ core, target });
    const trackStillInTarget = newIdx === core.getIndex() && String(target[newIdx]?.uid || '') === String(core.getCurrentTrack()?.uid || '');

    core.setPlaylist(target, Math.max(0, newIdx), {}, {
      preserveOriginalPlaylist: true,
      preserveShuffleMode: true,
      // Позицию сохраняем только если текущий трек остался тем же.
      preservePosition: !!trackStillInTarget
    });

    W.PlayerUI?.updateAvailableTracksForPlayback?.();
    W.PlayerUI?.updatePlaylistFiltering?.();
  };

  // Подписки: политика должна реагировать на изменения ⭐ и на смену плейлиста/контекста
  const bind = () => {
    const core = pc();
    if (!core?.onFavoritesChanged) return setTimeout(bind, 100);

    core.onFavoritesChanged(() => {
      const playingAlbum = W.AlbumsManager?.getPlayingAlbum?.();
      if (playingAlbum === FAV_KEY || isOn()) apply();
    });

    W.addEventListener('playlist:changed', apply);
  };
  bind();

  W.PlaybackPolicy = { apply };
})(window);
