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

function readAlertFlag() {
  // { on, ts, reason } or null
  const j = window.Utils?.lsGetJson ? window.Utils.lsGetJson(ALERT_KEY, null) : null;
  return !!j?.on;
}

function ensureAlertBadge(btn) {
  if (!btn) return null;

  let badge = document.getElementById('offline-alert-badge');
  if (badge) return badge;

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

  const on = window.Utils?.dom?.on || ((el, ev, fn, opts) => {
    if (!el) return () => {};
    el.addEventListener(ev, fn, opts);
    return () => el.removeEventListener(ev, fn, opts);
  });

  on(badge, 'click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    window.NotificationSystem?.info('Есть треки для обновления', 6000); // x2 длительности
  });

  return badge;
}

function attachOfflineAlertIndicator() {
  const U = window.Utils;
  const btn = U?.dom?.byId ? U.dom.byId('offline-btn') : document.getElementById('offline-btn');
  if (!btn) return;

  const badge = ensureAlertBadge(btn);
  if (!badge) return;

  const render = () => {
    badge.style.display = readAlertFlag() ? '' : 'none';
  };

  window.addEventListener('offline:uiChanged', render);
  render();
}

function setOfflineBtnUI() {
  const U = window.Utils;
  const btn = U?.dom?.byId ? U.dom.byId('offline-btn') : document.getElementById('offline-btn');
  if (!btn) return;

  const mgr = window.OfflineUI?.offlineManager;
  const isOffline = !!mgr?.isOfflineMode?.();

  btn.textContent = 'OFFLINE';
  btn.classList.toggle('offline', isOffline);
  btn.classList.toggle('online', !isOffline);
  btn.classList.toggle('alert', readAlertFlag());
}

export function attachOfflineUI() {
  const U = window.Utils;

  if (window.OfflineUI && window.OfflineUI.offlineManager) {
    attachOfflineAlertIndicator();
    setOfflineBtnUI();
    return;
  }

  const mgr = new OfflineManager();
  mgr.initialize();

  if (!window.OfflineUI) window.OfflineUI = {};
  window.OfflineUI.offlineManager = mgr;
  OfflineUI.offlineManager = mgr;

  const btn = U?.dom?.byId ? U.dom.byId('offline-btn') : document.getElementById('offline-btn');

  if (btn) {
    const on = U?.dom?.on || ((el, ev, fn, opts) => {
      if (!el) return () => {};
      el.addEventListener(ev, fn, opts);
      return () => el.removeEventListener(ev, fn, opts);
    });

    on(btn, 'click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openOfflineModal();
    });
  }

  attachOfflineAlertIndicator();
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
