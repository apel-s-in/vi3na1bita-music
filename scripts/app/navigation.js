// scripts/app/navigation.js (ESM)
// Логика навигации, deep-linking и обработка хеша URL.

(function(){
  function parseDeepLink() {
    try {
      const hash = location.hash.replace(/^#/, '');
      if (!hash) return;
      const parts = hash.split('/');
      const albumKey = parts[0];
      const trackNum = parts[1] ? parseInt(parts[1], 10) : NaN;
      
      if (albumKey && window.albumByKey(albumKey)) {
        if (window.currentAlbumKey !== albumKey) {
          if(typeof window.loadAlbumByKey === 'function') {
            window.loadAlbumByKey(albumKey).then(() => {
              if (Number.isInteger(trackNum) && trackNum > 0) {
                 if(window.playerCore) window.playerCore.play(trackNum - 1);
              }
            });
          }
        } else {
           if (Number.isInteger(trackNum) && trackNum > 0) {
              if(window.playerCore) window.playerCore.play(trackNum - 1);
           }
        }
      }
    } catch (e) {
      console.error('Deep link parsing error:', e);
    }
  }

  function updateURLHash(albumKey, trackIndex) {
    if (!albumKey) return;
    const trackNum = (typeof trackIndex === 'number' && trackIndex >= 0) ? trackIndex + 1 : '';
    const newHash = `#${albumKey}${trackNum ? '/' + trackNum : ''}`;
    if (location.hash !== newHash) {
      // Используем replaceState, чтобы не засорять историю браузера при каждом переключении трека
      history.replaceState(null, '', newHash);
    }
  }

  // Слушаем изменения хеша (например, при навигации кнопками "назад/вперед" в браузере)
  window.addEventListener('hashchange', parseDeepLink, false);

  // Экспорт
  window.parseDeepLink = parseDeepLink;
  window.updateURLHash = updateURLHash;
})();
