// scripts/ui/offline.js (ESM)
// Управление UI для оффлайн-режима.

(function(){
  function updateOfflineButtonState(state) {
      const btn = document.getElementById('offline-btn');
      if(!btn) return;
      btn.classList.remove('online', 'offline', 'syncing');
      btn.classList.add(state.status); // 'online', 'offline', 'syncing'
      btn.textContent = state.status.toUpperCase();
      
      const progressWrap = document.querySelector('.offline-progress');
      if (progressWrap) progressWrap.style.display = state.status === 'syncing' ? 'block' : 'none';
  }
  
  function updateOfflineProgress(data) {
      const { progress, total, currentFile } = data;
      const bar = document.querySelector('.offline-progress-bar');
      const desc = document.querySelector('.offline-desc');
      if (bar) bar.style.width = `${(progress / total) * 100}%`;
      if (desc) desc.textContent = `Кэширование: ${progress} / ${total}`;
  }

  function handleOfflineButtonClick() {
    if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) {
        window.NotificationSystem?.error('Service Worker не активен. Офлайн-режим недоступен.');
        return;
    }
    window.NotificationSystem?.info('Запрос на переключение офлайн-режима отправлен...');
    navigator.serviceWorker.controller.postMessage({ type: 'TOGGLE_OFFLINE' });
  }

  // Слушаем сообщения от Service Worker
  navigator.serviceWorker.addEventListener('message', event => {
    const { type, payload } = event.data;
    if (type === 'OFFLINE_STATUS_UPDATE') {
        updateOfflineButtonState(payload);
    } else if (type === 'OFFLINE_PROGRESS') {
        updateOfflineProgress(payload);
    } else if (type === 'OFFLINE_COMPLETE') {
        window.NotificationSystem?.success('Офлайн-кэш успешно обновлен!');
        updateOfflineButtonState({ status: 'offline' });
    } else if (type === 'CACHE_CLEANED') {
        window.NotificationSystem?.info('Старый кэш очищен.');
    }
  });

  // Запрашиваем начальный статус при загрузке
  navigator.serviceWorker.ready.then(reg => {
      reg.active?.postMessage({ type: 'GET_OFFLINE_STATUS' });
  });

  window.handleOfflineButtonClick = handleOfflineButtonClick;
})();
