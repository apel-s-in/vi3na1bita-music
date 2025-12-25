// scripts/ui/navigation.js
(function NavigationModule() {
  'use strict';
  const w = window;

  function init() {
    const menuBtn = w.Utils.$('menu-btn');
    const menuModal = w.Utils.$('menu-modal');
    const closeModal = w.Utils.$q('.menu-close');

    if (menuBtn) {
      menuBtn.addEventListener('click', () => {
        if (menuModal) menuModal.classList.add('active');
      });
    }
    if (closeModal) {
      closeModal.addEventListener('click', () => {
        if (menuModal) menuModal.classList.remove('active');
      });
    }

    // Меню-ссылки
    const menuLinks = w.Utils.$qa('.menu-link');
    menuLinks.forEach(link => {
      link.addEventListener('click', () => {
        if (menuModal) menuModal.classList.remove('active');
      });
    });

    // Обработчики кнопок
    w.Utils.$('sysinfo-btn')?.addEventListener('click', () => w.SysInfo?.show?.());
    w.Utils.$('favorites-data-btn')?.addEventListener('click', () => w.FavoritesData?.showInactiveFavoritesModal?.());
    w.Utils.$('clear-cache-btn')?.addEventListener('click', clearCache);
  }

  async function clearCache() {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const reg of registrations) {
        await reg.unregister();
      }
      caches.keys().then(keys => {
        return Promise.all(keys.map(key => caches.delete(key)));
      });
    }
    localStorage.clear();
    w.NotificationSystem?.success('Кэш и данные очищены. Перезагрузите страницу.');
  }

  w.NavigationManager = { init };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
