// scripts/app/offline-ui-bootstrap.js
// Единая offline-платформа (ESM).
// По ТЗ_Нью: кнопка OFFLINE всегда открывает модалку, toggle убран.
// НЕ трогаем воспроизведение (инвариант I1).

import { OfflineManager } from '../offline/offline-manager.js';
import { openOfflineModal } from '../ui/offline-modal.js';

// ✅ Единый источник истины — window.OfflineUI.
if (!window.OfflineUI || typeof window.OfflineUI !== 'object') {
  window.OfflineUI = { offlineManager: null };
}

// Экспортируем ссылку на глобальный объект
export const OfflineUI = window.OfflineUI;

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

  const mgr = window.OfflineUI?.offlineManager;
  const isOffline = !!mgr?.isOfflineMode?.();

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
  // Идемпотентность: если уже инициализировано, не делаем заново
  if (window.OfflineUI && window.OfflineUI.offlineManager) {
    // Просто обновим UI кнопки, если DOM перерисовался
    setOfflineBtnUI();
    return;
  }

  // Создаем менеджер
  const mgr = new OfflineManager();
  mgr.initialize();
  
  // Сохраняем в глобальный объект (источник правды для индикаторов)
  if (!window.OfflineUI) window.OfflineUI = {};
  window.OfflineUI.offlineManager = mgr;
  
  // Обновляем локальную ссылку экспорта
  OfflineUI.offlineManager = mgr;

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
