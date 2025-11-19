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
  // ВАЖНО: больше НИКОГДА не подсовываем сюда «просто текущий альбом».
  // Плейлист устанавливается только явно из UI (showTrack/ensureFavoritesPlayback).
  try {
    if (Array.isArray(window.playingTracks) && window.playingTracks.length) {
      const cover = window.playingCover || (window.coverGalleryArr?.[0]?.formats?.full) || 'img/logo.png';
      const tracks = window.playingTracks.map(t => ({
        src: t.audio,
        title: t.title,
        artist: window.playingArtist || 'Витрина Разбита',
        album: window.playingAlbumName || 'Альбом',
        cover,
        lyrics: t.lyrics,
        fulltext: t.fulltext || ''
      }));
      const meta = {
        artist: window.playingArtist || 'Витрина Разбита',
        album: window.playingAlbumName || 'Альбом',
        cover
      };
      const index = (Number.isInteger(window.playingTrack) && window.playingTrack >= 0) ? window.playingTrack : 0;
      pc.setPlaylist(tracks, index, meta);
    }
  } catch {}

  // Никаких обработчиков событий и управления DOM пока не вешаем — UI остаётся в старом режиме
})();
