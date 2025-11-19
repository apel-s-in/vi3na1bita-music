// scripts/player-adapter.js (ESM)
// Адаптер: создаём window.playerCore на основе src/PlayerCore.js,
// не вмешиваясь в существующий UI и <audio> на этом этапе.

import { PlayerCore } from '../src/PlayerCore.js';

(function initPlayerCoreAdapter() {
  if (window.playerCore) return;

  // Создаём ядро без событий (позже навесим onTick/onPlay и т.п. при маршрутизации UI)
  const pc = new PlayerCore();

  // Применим сохранённые режимы (без влияния на текущий <audio>)
  try {
    const vol = parseFloat(localStorage.getItem('playerVolume') || '1');
    if (Number.isFinite(vol)) pc.setVolume(vol);
  } catch {}
  try { pc.setRepeat(localStorage.getItem('repeatMode') === '1'); } catch {}
  try { pc.setShuffle(localStorage.getItem('shuffleMode') === '1'); } catch {}
  try {
    const favOnly = localStorage.getItem('favoritesOnlyMode') === '1';
    // Если уже играем «ИЗБРАННОЕ» — фильтр в ядре не нужен (плейлист уже отфильтрован)
    const isFavoritesCtx = (window.playingAlbumKey === window.SPECIAL_FAVORITES_KEY);
    const likedIdx = (!isFavoritesCtx && window.playingAlbumKey && window.getLikedForAlbum)
      ? window.getLikedForAlbum(window.playingAlbumKey)
      : [];
    pc.setFavoritesOnly(isFavoritesCtx ? false : favOnly, likedIdx);
  } catch {}

  // Экспортируем в глобальную область
  window.playerCore = pc;

  // Немедленно прикрепить диспетчер событий (без ожидания таймера в bootstrap)
  try {
    if (window.PlayerCoreObserver && typeof window.PlayerCoreObserver.attach === 'function') {
      window.PlayerCoreObserver.attach(pc);
    }
  } catch {}

  // Если уже есть активный контекст — передадим ЕГО в ядро.
  // Приоритет: 1) playingTracks (в т.ч. «ИЗБРАННОЕ»), 2) config.tracks.
  try {
    let tracks = null;
    let index = 0;
    let meta = null;

    if (Array.isArray(window.playingTracks) && window.playingTracks.length) {
      const cover = window.playingCover || (window.coverGalleryArr?.[0]?.formats?.full) || 'img/logo.png';
      tracks = window.playingTracks.map(t => ({
        src: t.audio,
        title: t.title,
        artist: window.playingArtist || 'Витрина Разбита',
        album: window.playingAlbumName || 'Альбом',
        cover,
        lyrics: t.lyrics,
        fulltext: t.fulltext || ''
      }));
      meta = {
        artist: window.playingArtist || 'Витрина Разбита',
        album: window.playingAlbumName || 'Альбом',
        cover
      };
      index = (Number.isInteger(window.playingTrack) && window.playingTrack >= 0) ? window.playingTrack : 0;
    } else if (window.config && Array.isArray(window.config.tracks)) {
      const cover = (window.coverGalleryArr?.[0]?.formats?.full) || 'img/logo.png';
      tracks = (window.config.tracks || []).map(t => ({
        src: t.audio,
        title: t.title,
        artist: window.config.artist || 'Витрина Разбита',
        album: window.config.albumName || 'Альбом',
        cover,
        lyrics: t.lyrics,
        fulltext: t.fulltext || ''
      }));
      meta = {
        artist: window.config.artist || 'Витрина Разбита',
        album: window.config.albumName || 'Альбом',
        cover
      };
      index = 0;
    }

    if (tracks) {
      pc.setPlaylist(tracks, index, meta);
    }
  } catch {}

  // Никаких обработчиков событий и управления DOM пока не вешаем — UI остаётся в старом режиме
})();
