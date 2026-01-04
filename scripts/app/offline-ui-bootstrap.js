// scripts/app/offline-ui-bootstrap.js
// Единая offline-платформа (ESM).
// По ТЗ_Нью: кнопка OFFLINE всегда открывает модалку, toggle убран.
// НЕ трогаем воспроизведение (инвариант I1).

import { OfflineManager } from '../offline/offline-manager.js';
import { openOfflineModal } from '../ui/offline-modal.js';

// ✅ Единый источник истины — window.OfflineUI.
// ESM-export OfflineUI будет ссылкой на window.OfflineUI (а не отдельным объектом),
// чтобы не было рассинхрона между импортами и глобалкой.
export const OfflineUI = (() => {
  try {
    if (!window.OfflineUI || typeof window.OfflineUI !== 'object') {
      window.OfflineUI = { offlineManager: null };
    } else if (!('offlineManager' in window.OfflineUI)) {
      window.OfflineUI.offlineManager = null;
    }
    return window.OfflineUI;
  } catch {
    // fallback (на случай очень странных окружений)
    return { offlineManager: null };
  }
})();

const ALERT_KEY = 'offline:alert:v1';

function readAlert() {
  try {
    const raw = localStorage.getItem(ALERT_KEY);
    const j = raw ? JSON.parse(raw) : null;
    return !!j?.on;
  } catch {
    return false;
  }
}

function setOfflineBtnUI() {
  const btn = document.getElementById('offline-btn');
  if (!btn) return;

  const isOffline = !!OfflineUI.offlineManager?.isOfflineMode?.();

  // По ТЗ: кнопка не должна быть текстом ONLINE/OFFLINE.
  // Оставляем стабильный текст OFFLINE, а состояние показываем внутри модалки.
  btn.textContent = 'OFFLINE';

  // Классы оставим как стилизацию “режима” (не текст)
  btn.classList.toggle('offline', isOffline);
  btn.classList.toggle('online', !isOffline);

  // Badge "!" по сигналу alert
  btn.classList.toggle('alert', readAlert());
}

export function attachOfflineUI() {
  if (OfflineUI.offlineManager) return;

  OfflineUI.offlineManager = new OfflineManager();
  OfflineUI.offlineManager.initialize();

  const btn = document.getElementById('offline-btn');
  if (btn && !btn.__offlineBound) {
    btn.__offlineBound = true;

    btn.addEventListener('click', async () => {
      // Всегда открываем модалку (по ТЗ)
      try {
        await openOfflineModal();
      } catch (e) {
        window.NotificationSystem?.error('Не удалось открыть OFFLINE настройки');
      } finally {
        setOfflineBtnUI();
      }
    });
  }

  // Обновление UI по внутренним событиям
  window.addEventListener('offline:uiChanged', () => setOfflineBtnUI());

  // Начальная синхронизация UI
  setOfflineBtnUI();
}
