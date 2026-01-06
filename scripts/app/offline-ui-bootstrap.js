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
function attachOfflineAlertIndicator() {
  const btn = document.getElementById('offline-btn');
  if (!btn) return;

  // Вставляем "!" слева от кнопки
  let badge = document.getElementById('offline-alert-badge');
  if (!badge) {
    badge = document.createElement('span');
    badge.id = 'offline-alert-badge';
    badge.textContent = '!';
    badge.style.display = 'none';
    badge.style.marginRight = '8px';
    badge.style.fontWeight = '900';
    badge.style.color = '#ffcc00';
    badge.style.cursor = 'pointer';
    badge.title = 'Есть треки для обновления';

    btn.parentNode.insertBefore(badge, btn);

    badge.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      window.NotificationSystem?.info('Есть треки для обновления', 6000); // x2 длительности
    });
  }

  const readAlert = () => {
    try {
      const raw = localStorage.getItem('offline:alert:v1');
      if (!raw) return { on: false };
      return JSON.parse(raw) || { on: false };
    } catch {
      return { on: false };
    }
  };

  const render = () => {
    const a = readAlert();
    badge.style.display = a?.on ? '' : 'none';
  };

  window.addEventListener('offline:uiChanged', render);
  render();
}

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
