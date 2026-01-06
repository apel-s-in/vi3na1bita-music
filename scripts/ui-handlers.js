//=================================================
// FILE: scripts/ui-handlers.js
// Обработчики UI: модалки, индикаторы, кнопки, toast и т.д.
(() => {
  const toast = (msg, type = 'info', duration = 3000) => {
    const container = document.getElementById('toast-container') || createToastContainer();
    const t = document.createElement('div');
    t.className = `toast toast-${type} show`;
    t.innerHTML = `<div class="toast-content"><div class="toast-message">${msg}</div></div>`;
    container.appendChild(t);
    setTimeout(() => t.classList.remove('show'), duration);
    setTimeout(() => t.remove(), duration + 300);
  };

  const createToastContainer = () => {
    const c = document.createElement('div');
    c.id = 'toast-container';
    document.body.appendChild(c);
    return c;
  };

  // Кнопка OFFLINE
  document.getElementById('offline-btn').addEventListener('click', openOfflineModal);

  // Индикатор "!" (needsUpdate / needsReCache)
  const checkAlert = () => {
    let hasAlert = false;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key.startsWith('meta:')) {
        const meta = JSON.parse(localStorage.getItem(key));
        if (meta.needsUpdate || meta.needsReCache) {
          hasAlert = true;
          break;
        }
      }
    }
    document.getElementById('offline-btn').classList.toggle('alert', hasAlert);
  };

  // Клик по "!" → toast
  document.getElementById('offline-btn').addEventListener('click', (e) => {
    if (document.getElementById('offline-btn').classList.contains('alert')) {
      toast('Есть треки для обновления', 'warning', 4000);
    }
  });

  // Индикаторы в треках (клик → toggle pinned или cloud menu)
  document.addEventListener('click', async (e) => {
    if (e.target.classList.contains('offline-indicator')) {
      const trackEl = e.target.closest('.track');
      const uid = trackEl.dataset.uid;
      const meta = JSON.parse(localStorage.getItem(`meta:${uid}`) || '{}');

      if (meta.pinned) {
        // Снимаем pinned → становится cloud-кандидат
        await offlineManager.togglePinned(uid, false);
        toast('Офлайн-закрепление снято. Трек может быть удалён при очистке кэша.', 'info');
      } else if (meta.cloud) {
        openCloudMenu(uid);
      } else {
        // Серый → pinned
        await offlineManager.togglePinned(uid, true);
        toast('Трек будет доступен офлайн. Начинаю скачивание…', 'success');
      }
      offlineManager.updateTrackIndicators(uid);
      checkAlert();
    }
  });

  // PQ кнопка (переключение + disable при no network)
  document.getElementById('pq-btn').addEventListener('click', () => {
    if (document.getElementById('pq-btn').classList.contains('disabled')) {
      toast('Нет доступа к сети', 'warning');
      return;
    }
    const newPQ = localStorage.getItem('qualityMode:v1') === 'hi' ? 'lo' : 'hi';
    localStorage.setItem('qualityMode:v1', newPQ);
    document.getElementById('pq-btn').classList.toggle('pq-hi', newPQ === 'hi');
    document.getElementById('pq-btn').classList.toggle('pq-lo', newPQ === 'lo');
    // Тихое переключение текущего трека
    W.playerCore.rebuildCurrentSound({ preferWebAudio: true });
  });

  // Проверка сети → disable PQ
  const updatePQButton = () => {
    const disabled = !navigator.onLine;
    document.getElementById('pq-btn').classList.toggle('disabled', disabled);
  };
  window.addEventListener('online', updatePQButton);
  window.addEventListener('offline', updatePQButton);
  updatePQButton();

  // Статистика модалка (клик по логотипу или отдельная кнопка)
  document.querySelector('.logo-bottom').addEventListener('click', openStatisticsModal);

  // Второй слой прогресса кэша
  const updateCacheProgress = (uid) => {
    // Упрощённо: если скачивается CUR, показываем прогресс (реальный прогресс через fetch + onprogress)
    // Здесь заглушка — в реальности в download-queue добавить onProgress callback
    const progressEl = document.querySelector('.player-progress-fill-cache'); // добавь в HTML второй div
    if (progressEl) progressEl.style.width = '70%'; // пример
  };

  // Периодический чек алерта
  setInterval(checkAlert, 10000);
  checkAlert();
})();
