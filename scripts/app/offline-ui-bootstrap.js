/**
 * scripts/app/offline-ui-bootstrap.js
 * Optimized v2.0
 * 
 * FIX: Удалена дублирующая проверка квоты 60MB (делегировано в offline-manager).
 * ADD: Синхронизация состояния Авиарежима (Network Policy) с Service Worker.
 */

export function initOfflineUI() {
  // Инициализация базовых UI-компонентов (модалки, индикаторы)
  // Вся логика работы с квотами перенесена в ядро OfflineManager

  syncAirplaneModeToSW();

  // 1. Слушаем глобальные изменения стораджа (если переключили в другой вкладке)
  window.addEventListener('storage', (e) => {
    if (e.key === 'airplaneMode' || e.key === 'netPolicy') {
      syncAirplaneModeToSW();
    }
  });

  // 2. Слушаем локальные клики по UI-тумблерам Авиарежима (делегирование событий)
  document.body.addEventListener('change', (e) => {
    if (e.target.matches('#airplane-mode-toggle, .airplane-toggle, [data-action="toggle-airplane"]')) {
      // Небольшая задержка, чтобы netPolicy успел записать новый стейт в localStorage
      setTimeout(syncAirplaneModeToSW, 50); 
    }
  });
}

function syncAirplaneModeToSW() {
  if (!navigator.serviceWorker || !navigator.serviceWorker.controller) return;

  // Читаем актуальный стейт (поддерживаем оба варианта хранения ключей)
  const isAirplane = localStorage.getItem('airplaneMode') === 'true' || 
                     (localStorage.getItem('netPolicy') || '').includes('airplane');

  navigator.serviceWorker.controller.postMessage({
    type: 'SYNC_AIRPLANE_MODE',
    payload: isAirplane
  });
}

// Автоматический старт при готовности DOM
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initOfflineUI);
} else {
  initOfflineUI();
}

export default { initOfflineUI };
