// scripts/core/bootstrap.js (ESM)
// Инициализация всего приложения. Эквивалент `window.onload`.

(function(){
  function initializeMainUi() {
    // 1. Устанавливаем классы для устройства (iOS/Android)
    const body = document.body;
    if (window.isMobileUA && /iPhone|iPad|iPod/.test(navigator.userAgent)) body.classList.add('ios');
    if (window.isMobileUA && /Android/.test(navigator.userAgent)) body.classList.add('android');

    // 2. Инициализируем контролы плеера (слайдеры громкости и перемотки)
    if(typeof window.initializePlayerControls === 'function') window.initializePlayerControls();

    // 3. Восстанавливаем состояния UI
    if(typeof window.restoreEcoMode === 'function') window.restoreEcoMode();
    if(typeof window.restoreLyricsWindowState === 'function') window.restoreLyricsWindowState();
    
    // 4. Загружаем список альбомов
    if(typeof window.loadAlbumsIndex === 'function') {
      window.loadAlbumsIndex().then(() => {
        // 5. После загрузки списка, загружаем последний активный или первый альбом
        const lastAlbum = localStorage.getItem('currentAlbum');
        const firstAlbum = window.albumsIndex?.[0]?.key;
        const albumToLoad = (lastAlbum && window.albumByKey(lastAlbum)) ? lastAlbum : firstAlbum;
        
        if (albumToLoad) {
          if(typeof window.loadAlbumByKey === 'function') window.loadAlbumByKey(albumToLoad);
        } else {
            console.error("Не найдено ни одного альбома для загрузки.");
        }
      });
    }

    // 6. Логика промо-кода
    const promoBtn = document.getElementById('promo-btn');
    const promoInp = document.getElementById('promo-inp');
    if(promoBtn && promoInp) {
        const checkPromo = () => {
             // Здесь должна быть ваша логика проверки промокода.
             // Для примера, любой код, кроме пустого, будет верным.
             if(promoInp.value.trim()){
                 localStorage.setItem('promoPassed', '1');
                 document.getElementById('promocode-block').style.display = 'none';
                 document.getElementById('main-block').classList.remove('hidden');
                 initializeMainUi(); // Повторная инициализация UI после входа
             } else {
                 document.getElementById('promo-error').textContent = 'Неверный промокод';
             }
        };
        promoBtn.addEventListener('click', checkPromo);
        promoInp.addEventListener('keypress', (e) => {
            if(e.key === 'Enter') checkPromo();
        });
    }

  }

  window.initializeMainUi = initializeMainUi;
})();
