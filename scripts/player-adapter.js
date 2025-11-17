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
    // Пока не передаём список «избранных» индексов — заполним позже при реальной маршрутизации
    pc.setFavoritesOnly(favOnly, []);
  } catch {}

  // Экспортируем в глобальную область
  window.playerCore = pc;

  // Немедленно прикрепить диспетчер событий (без ожидания таймера в bootstrap)
  try {
    if (window.PlayerCoreObserver && typeof window.PlayerCoreObserver.attach === 'function') {
      window.PlayerCoreObserver.attach(pc);
    }
  } catch {}

  // Если уже загружен альбом — передадим плейлист (снимок из текущей конфигурации)
  try {
    if (window.config && Array.isArray(window.config.tracks)) {
      const tracks = (window.config.tracks || []).map(t => ({
        src: t.audio,
        title: t.title,
        artist: window.config.artist || 'Витрина Разбита',
        album: window.config.albumName || 'Альбом',
        cover: (window.coverGalleryArr?.[0]?.formats?.full) || 'img/logo.png',
        lyrics: t.lyrics,
        fulltext: t.fulltext || ''
      }));
      const meta = {
        artist: window.config.artist || 'Витрина Разбита',
        album: window.config.albumName || 'Альбом',
        cover: (window.coverGalleryArr?.[0]?.formats?.full) || 'img/logo.png'
      };
      pc.setPlaylist(tracks, 0, meta);
    }
  } catch {}

  // Никаких обработчиков событий и управления DOM пока не вешаем — UI остаётся в старом режиме
})();
