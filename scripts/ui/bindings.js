// scripts/ui/bindings.js (ESM)
// Централизованная привязка всех обработчиков событий (клики, клавиатура).

(function(){
  // --- Делегирование событий клика ---
  document.body.addEventListener('click', (e) => {
    const target = e.target.closest('[data-action]');
    if (!target) return;

    const action = target.dataset.action;
    const idx = parseInt(target.dataset.idx, 10);
    
    // Предотвращаем стандартное поведение для кнопок
    if(target.tagName === 'BUTTON' || target.closest('button')) e.preventDefault();

    switch(action) {
      // Player controls
      case 'toggle-play-pause': window.togglePlayPause?.(); break;
      case 'next-track': window.nextTrack?.(); break;
      case 'prev-track': window.previousTrack?.(); break;
      case 'stop-playback': window.stopPlayback?.(); break;
      case 'toggle-mute': window.toggleMute?.(); break;
      case 'toggle-shuffle': window.toggleShuffle?.(); break;
      case 'toggle-repeat': window.toggleRepeat?.(); break;
      case 'toggle-favorites-only': window.toggleFavoritesOnly?.(); break;
      
      // Track list
      case 'play-track': if(Number.isInteger(idx)) window.playerCore?.play(idx); break;
      case 'toggle-favorite': {
          const akey = target.dataset.albumKey;
          const tidx = parseInt(target.dataset.trackIndex, 10);
          if (akey && Number.isInteger(tidx)) window.toggleFavorite?.(akey, tidx);
          break;
      }
      case 'play-favorite': { // Для вида "Избранное"
          const akey = target.dataset.favAlbum;
          const tidx = parseInt(target.dataset.favTrack, 10);
          // Здесь нужна специальная логика для проигрывания из плейлиста избранного
          window.playerCore?.playFavorite?.(akey, tidx);
          break;
      }
       case 'toggle-favorite-from-fav-view': {
          const akey = target.parentElement.dataset.favAlbum;
          const tidx = parseInt(target.parentElement.dataset.favTrack, 10);
          if (akey && Number.isInteger(tidx)) window.toggleFavorite?.(akey, tidx);
          break;
       }


      // UI & Effects
      case 'toggle-animation': window.toggleAnimation?.(); break;
      case 'toggle-bit': window.toggleBit?.(); break;
      case 'toggle-eco': window.toggleEcoMode?.(); break;
      case 'toggle-lyrics': window.toggleLyricsWindow?.(); break;
      
      // Gallery
      case 'gallery-prev': window.prevCover?.(); break;
      case 'gallery-next': window.nextCover?.(); break;

      // Sleep timer
      case 'open-sleep-menu': window.openSleepMenu?.(); break;
      case 'set-sleep-timer': {
          const minutes = parseInt(target.dataset.minutes, 10);
          if(Number.isInteger(minutes)) window.setSleepTimer?.(minutes);
          break;
      }
      case 'extend-sleep': window.extendSleepTimer?.(); break;
      case 'close-sleep-overlay': window.closeSleepOverlay?.(); break;

      // Modals
      case 'open-feedback': window.toggleModal?.('modal-feedback', true); break;
      case 'close-feedback': window.toggleModal?.('modal-feedback', false); break;
      case 'open-hotkeys': window.toggleModal?.('hotkeys-modal', true); break;
      case 'close-hotkeys': window.toggleModal?.('hotkeys-modal', false); break;
      
      // PWA & Downloads
      case 'install-pwa': window.installPWA?.(); break;
      case 'download-album': window.downloadAlbum?.(window.currentAlbumKey); break;
      case 'download-track': {
          // Эта логика может потребовать доработки, т.к. кнопка скачивания трека может быть не в списке
          break;
      }
      case 'filter-favorites': window.__toggleFavoritesOnly_impl?.(); break;

      // ... другие действия
    }
  });

  // --- Горячие клавиши ---
  window.addEventListener('keydown', (e) => {
    // Не перехватываем ввод в инпутах
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
    
    const key = e.key.toLowerCase();
    
    let handled = true;
    switch(key) {
        case ' ': case 'k': window.togglePlayPause?.(); break;
        case 'x': window.stopPlayback?.(); break;
        case 'n': window.nextTrack?.(); break;
        case 'p': window.previousTrack?.(); break;
        case 'j': window.playerCore?.seek(Math.max(0, (window.playerCore.getSeek() || 0) - 10)); break;
        case 'l': window.playerCore?.seek(Math.min((window.playerCore.getDuration() || 0), (window.playerCore.getSeek() || 0) + 10)); break;
        case '+': window.playerCore?.setVolume(Math.min(1, (window.playerCore.getVolume() || 0) + 0.1)); break;
        case '-': window.playerCore?.setVolume(Math.max(0, (window.playerCore.getVolume() || 0) - 0.1)); break;
        case 'm': window.toggleMute?.(); break;
        case 'r': window.toggleRepeat?.(); break;
        case 'u': window.toggleShuffle?.(); break;
        case 'f': window.toggleFavoritesOnly?.(); break;
        case 't': window.openSleepMenu?.(); break;
        case 'a': window.toggleAnimation?.(); break;
        case 'b': window.toggleBit?.(); break;
        case 'y': window.toggleLyricsWindow?.(); break;
        case 'd': { // Добавить в избранное текущий трек
            const akey = window.playingAlbumKey;
            const tidx = window.playingTrack;
            if(akey && typeof tidx === 'number') window.toggleFavorite?.(akey, tidx);
            break;
        }
        case '?': window.toggleModal?.('hotkeys-modal', true); break;
        case 'escape': 
          window.toggleModal?.('hotkeys-modal', false);
          window.toggleModal?.('modal-feedback', false);
          window.closeSleepMenu?.();
          break;
        default: handled = false;
    }
    if (handled) e.preventDefault();
  });
})();
