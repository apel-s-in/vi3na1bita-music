// scripts/player-adapter.js (ESM)
// Адаптер для создания и настройки ядра плеера PlayerCore (Howler.js).

// Предполагается, что ваш PlayerCore находится в 'src/PlayerCore.js'
// и является ESM-модулем, экспортирующим класс PlayerCore.
// Если это не так, адаптируйте импорт.
import PlayerCore from '../src/PlayerCore.js';

(function() {
  if (window.playerCore) return;

  const savedVolume = parseFloat(localStorage.getItem('playerVolume') || '1');
  
  const player = new PlayerCore({
    volume: Number.isFinite(savedVolume) ? savedVolume : 1,
    repeat: localStorage.getItem('repeatMode') === '1',
    shuffle: localStorage.getItem('shuffleMode') === '1',
    favoritesOnly: localStorage.getItem('favoritesOnlyMode') === '1',
    initialFavorites: Array.from(window.getFavorites ? window.getFavorites().keys() : []),

    // Функция, которая предоставляет плееру актуальный плейлист
    getPlaylist: () => {
        // В режиме "Избранное" плейлист формируется особым образом
        if (window.viewMode === 'favorites') {
            const favs = Array.from((window.getFavorites ? window.getFavorites().values() : []) || []);
            return favs.map(f => ({ ...f, audio: f.audio, title: f.title }));
        }
        // В обычном режиме
        return window.config?.tracks || [];
    },
    
    // Функция для получения метаданных альбома
    getAlbumMeta: () => ({
        key: window.currentAlbumKey,
        title: window.config?.albumName || 'Витрина Разбита'
    }),
    
    // Функция для получения URL обложки
    getCover: () => {
        const cover = window.coverGalleryArr?.[0];
        return cover?.formats?.full || cover?.src || 'img/logo.png';
    }
  });

  window.playerCore = player;
  
  // Обновляем громкость в UI после инициализации
  if(typeof window.updateVolumeUI === 'function') window.updateVolumeUI(player.getVolume());

})();
