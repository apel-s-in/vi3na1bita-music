(function (W) {
  'use strict';
  const apply = () => {
    const core = W.playerCore, pAlbum = W.AlbumsManager?.getPlayingAlbum?.();
    const isFavOnly = localStorage.getItem('favoritesOnlyMode') === '1';
    const src = core?.originalPlaylist || [];
    
    if (!core || !pAlbum || !src.length || core.getIndex() < 0) return;

    // Remove duplicates
    const uniq = src.filter((t, i, arr) => t?.uid && arr.findIndex(x => x.uid === t.uid) === i);
    let tgt = uniq;

    if (pAlbum === (W.SPECIAL_FAVORITES_KEY || '__favorites__')) {
      tgt = uniq.filter(t => core.isFavorite?.(t.uid));
    } else if (isFavOnly) {
      const liked = new Set(core.getLikedUidsForAlbum?.(pAlbum) || []);
      tgt = uniq.filter(t => liked.has(t.uid));
    }

    if (!tgt.length) return; // Silent fallback if settings mismatch

    const curUid = String(core.getCurrentTrack?.()?.uid || '').trim();
    const nIdx = Math.max(0, tgt.findIndex(t => String(t?.uid || '').trim() === curUid));
    const preserve = nIdx === core.getIndex() && String(tgt[nIdx]?.uid || '') === curUid;

    core.setPlaylist(tgt, nIdx, {}, { preserveOriginalPlaylist: true, preserveShuffleMode: true, preservePosition: preserve });
    W.PlayerUI?.updateAvailableTracksForPlayback?.();
    W.PlayerUI?.updatePlaylistFiltering?.();
  };

  const bind = () => {
    if (!W.playerCore?.onFavoritesChanged) return setTimeout(bind, 100);
    W.playerCore.onFavoritesChanged(() => {
      const pAlbum = W.AlbumsManager?.getPlayingAlbum?.();
      if (pAlbum === (W.SPECIAL_FAVORITES_KEY || '__favorites__') || localStorage.getItem('favoritesOnlyMode') === '1') apply();
    });
    W.addEventListener('playlist:changed', apply);
  };
  bind();

  W.PlaybackPolicy = { apply };
})(window);
