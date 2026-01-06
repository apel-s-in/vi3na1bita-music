// scripts/app/offline-ui-bootstrap.js
// Единая offline-платформа (ESM).
// По ТЗ_Нью: кнопка OFFLINE всегда открывает модалку, toggle убран.
// НЕ трогаем воспроизведение (инвариант I1).

import { OfflineManager } from '../offline/offline-manager.js';
import { openOfflineModal } from '../ui/offline-modal.js';

if (!window.OfflineUI || typeof window.OfflineUI !== 'object') {
  window.OfflineUI = { offlineManager: null };
}

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

  btn.textContent = 'OFFLINE';

  btn.classList.toggle('offline', isOffline);
  btn.classList.toggle('online', !isOffline);

  btn.classList.toggle('alert', readAlert());
}

export function attachOfflineUI() {
  if (window.OfflineUI && window.OfflineUI.offlineManager) {
    setOfflineBtnUI();
    return;
  }

  const mgr = new OfflineManager();
  mgr.initialize();
  
  if (!window.OfflineUI) window.OfflineUI = {};
  window.OfflineUI.offlineManager = mgr;
  
  OfflineUI.offlineManager = mgr;

  const btn = document.getElementById('offline-btn');
  if (btn) {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openOfflineModal();
    });
  }

  setOfflineBtnUI();

  window.addEventListener('offline:uiChanged', () => setOfflineBtnUI());

  mgr.on('progress', (ev) => {
    if (ev?.phase === 'cqChanged' || ev?.phase === 'cloudSettingsChanged') {
      setOfflineBtnUI();
    }
  });
}

export function getOfflineManager() {
  return window.OfflineUI?.offlineManager || null;
}
