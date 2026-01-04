// scripts/app/offline-ui-bootstrap.js
// Единая offline-платформа (ESM).
// MVP: чтобы UI-индикаторы/overlay/PlaybackCache не падали.
// НЕ трогаем воспроизведение (инвариант I1).

import { OfflineManager } from '../offline/offline-manager.js';

export const OfflineUI = {
  offlineManager: null
};

function setOfflineBtnUI(isOffline) {
  const btn = document.getElementById('offline-btn');
  if (!btn) return;

  btn.classList.toggle('offline', !!isOffline);
  btn.classList.toggle('online', !isOffline);
  btn.textContent = isOffline ? 'OFFLINE' : 'ONLINE';
}

export function attachOfflineUI() {
  if (OfflineUI.offlineManager) return;

  OfflineUI.offlineManager = new OfflineManager();
  OfflineUI.offlineManager.initialize();

  const btn = document.getElementById('offline-btn');
  if (btn && !btn.__offlineBound) {
    btn.__offlineBound = true;

    btn.addEventListener('click', async () => {
      const next = !OfflineUI.offlineManager.isOfflineMode();
      OfflineUI.offlineManager.setOfflineMode(next);

      setOfflineBtnUI(next);

      if (next) {
        window.NotificationSystem?.offline('OFFLINE режим включён');
      } else {
        window.NotificationSystem?.success('ONLINE режим включён');
      }
    });
  }

  // Начальная синхронизация UI
  setOfflineBtnUI(OfflineUI.offlineManager.isOfflineMode());
}
