/**
 * scripts/ui/offline-indicators.js
 * Визуальная индикация 🔒 (Pinned) и ☁ (Cloud) в списках треков.
 *
 * ТЗ: Приложение П.7.1–П.7.4, П.4.2–П.4.4, П.5.5, П.12.1
 *
 * Инварианты:
 * - UI-only: не трогаем воспроизведение (no stop/play/seek/volume).
 * - DOM/CSS: не меняем классы/структуру (offline-ind, cloud-menu, offline-btn-alert).
 */

import { getOfflineManager } from '../offline/offline-manager.js';

/* CSS стили (offline-ind, cloud-menu) должны быть в main.css */
function injectCSS() { /* no-op */ }

const $all = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/* ──────────────────────────────────────────────────────────
 * Track indicator (single)
 * ────────────────────────────────────────────────────────── */

export async function injectIndicator(trackEl) {
  if (!trackEl) return;

  const uid = String(trackEl.dataset?.uid || '').trim();
  if (!uid) return;

  injectCSS();

  const mgr = getOfflineManager();
  const state = await mgr.getTrackOfflineState(uid);

  let ind = trackEl.querySelector('.offline-ind');
  if (!ind) {
    ind = document.createElement('span');
    ind.className = 'offline-ind';

    // ТЗ 5.3: offline-ind перед .tnum
    const tnum = trackEl.querySelector('.tnum');
    if (tnum) trackEl.insertBefore(ind, tnum);
    else trackEl.prepend(ind);

    ind.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      handleIndicatorClick(ind).catch(() => {});
    });
  }

  ind.dataset.uid = uid;
  ind._uid = uid;
  ind._offlineState = state;

  await applyIndicatorState(ind, state);
}

async function applyIndicatorState(ind, state) {
  ind.className = 'offline-ind';
  ind.title = '';
  ind.textContent = '';

  const mgr = getOfflineManager();
  const spaceOk = await hasSpace(mgr);

  switch (state?.status) {
    case 'pinned': {
      ind.textContent = '🔒';
      if (state.downloading) {
        ind.classList.add('offline-ind--pinned-loading');
        ind.title = 'Закреплён (загружается…)';
      } else {
        ind.classList.add('offline-ind--pinned');
        ind.title = 'Закреплён офлайн';
      }
      return;
    }

    case 'cloud': {
      // ТЗ: ☁ показываем только когда cloud=true И 100% готово
      ind.textContent = '☁';
      ind.classList.add('offline-ind--cloud');
      ind.title = `Облачный кэш (осталось ${state.daysLeft || '?'} дн.)`;
      return;
    }

    // cloud_loading/transient/none => серый 🔒
    default: {
      ind.textContent = '🔒';
      ind.classList.add(spaceOk ? 'offline-ind--none' : 'offline-ind--nospace');

      if (state?.status === 'cloud_loading') ind.title = 'Облачный кэш (загружается…) — нажмите чтобы закрепить';
      else if (!spaceOk) ind.title = 'Недостаточно места на устройстве';
      else ind.title = 'Нажмите, чтобы закрепить офлайн';
    }
  }
}

async function hasSpace(mgr) {
  try {
    if (typeof mgr?.hasSpace === 'function') return await mgr.hasSpace();
    if (typeof mgr?.isSpaceOk === 'function') return await mgr.isSpaceOk();
  } catch {}
  return true;
}

/* ──────────────────────────────────────────────────────────
 * Click handler
 * ────────────────────────────────────────────────────────── */

async function handleIndicatorClick(ind) {
  const uid = String(ind?._uid || '').trim();
  const state = ind?._offlineState;
  if (!uid || !state) return;

  const mgr = getOfflineManager();

  switch (state.status) {
    // Серый 🔒 / transient / cloud_loading: начать пиннинг
    case 'none':
    case 'transient':
    case 'cloud_loading': {
      if (!(await hasSpace(mgr))) {
        window.NotificationSystem?.show?.(
          'Недостаточно места на устройстве. Освободите память для офлайн-кэша.',
          'warning'
        );
        return;
      }
      await mgr.togglePinned(uid);
      await refreshOne(ind);
      scheduleOfflineButtonAlertUpdate();
      return;
    }

    // Жёлтый 🔒: снять -> станет cloud
    case 'pinned':
      await mgr.togglePinned(uid);
      await refreshOne(ind);
      scheduleOfflineButtonAlertUpdate();
      return;

    // ☁: меню
    case 'cloud':
      showCloudMenu(ind, uid);
      return;
  }
}

/* ──────────────────────────────────────────────────────────
 * Cloud menu (popup)
 * ────────────────────────────────────────────────────────── */

let _activeCloudMenu = null;

function closeCloudMenu() {
  try { _activeCloudMenu?.remove(); } catch {}
  _activeCloudMenu = null;
}

function showCloudMenu(ind, uid) {
  closeCloudMenu();

  const menu = document.createElement('div');
  menu.className = 'cloud-menu';
  Object.assign(menu.style, { position: 'fixed', zIndex: '99999' });

  menu.innerHTML = `
    <div class="cloud-menu__item" data-action="pin">🔒 Закрепить</div>
    <div class="cloud-menu__item cloud-menu__item--danger" data-action="del">🗑 Удалить из кэша</div>
  `;

  menu.addEventListener('click', (e) => {
    e.stopPropagation();
    const act = e.target.closest('[data-action]')?.dataset.action;
    if (!act) return;

    closeCloudMenu();

    const mgr = getOfflineManager();

    if (act === 'pin') {
      mgr.togglePinned(uid).then(() => refreshOne(ind)).then(scheduleOfflineButtonAlertUpdate).catch(() => {});
      return;
    }

    if (act === 'del' && window.Modals?.confirm) {
      window.Modals.confirm({
        title: 'Удалить из кэша?',
        textHtml: 'Статистика облачка будет сброшена.<br>Global-статистика останется.',
        confirmText: 'Удалить',
        cancelText: 'Отмена',
        onConfirm: async () => {
          await mgr.removeCached(uid);
          await refreshOne(ind);
          scheduleOfflineButtonAlertUpdate();
        }
      });
    }
  });

  document.body.appendChild(menu);
  _activeCloudMenu = menu;
  positionMenu(ind, menu);

  // close on outside click
  setTimeout(() => {
    const onDocClick = (e) => {
      if (_activeCloudMenu && !_activeCloudMenu.contains(e.target)) closeCloudMenu();
      document.removeEventListener('click', onDocClick);
    };
    document.addEventListener('click', onDocClick);
  }, 50);
}

function positionMenu(target, menu) {
  const r = target.getBoundingClientRect();
  const menuH = 80;
  const bottomSpace = window.innerHeight - r.bottom;

  if (bottomSpace < menuH + 20) menu.style.bottom = `${window.innerHeight - r.top + 5}px`;
  else menu.style.top = `${r.bottom + 5}px`;

  let left = r.left;
  if (left + 150 > window.innerWidth) left = window.innerWidth - 160;
  menu.style.left = `${left}px`;
}

/* ──────────────────────────────────────────────────────────
 * Batch helpers: refresh indicators + OFFLINE "!" badge
 * ────────────────────────────────────────────────────────── */

async function refreshOne(ind) {
  const uid = String(ind?._uid || '').trim();
  if (!uid) return;

  const mgr = getOfflineManager();
  const state = await mgr.getTrackOfflineState(uid);

  ind._offlineState = state;
  await applyIndicatorState(ind, state);
}

export async function injectOfflineIndicators(container) {
  injectCSS();
  const root = container || document;
  await Promise.all($all('.track[data-uid]', root).map(injectIndicator));
}

export async function refreshAllIndicators() {
  await Promise.all($all('.offline-ind').map(refreshOne));
  scheduleOfflineButtonAlertUpdate();
}

/* ──────────────────────────────────────────────────────────
 * OFFLINE button "!" (needsReCache / needsUpdate)
 * ────────────────────────────────────────────────────────── */

let _metaLoader = null;
let _alertTimer = 0;

async function loadGetAllTrackMetas() {
  if (_metaLoader) return _metaLoader;
  _metaLoader = import('../offline/cache-db.js')
    .then((m) => (typeof m.getAllTrackMetas === 'function' ? m.getAllTrackMetas : null))
    .catch(() => null);
  return _metaLoader;
}

function scheduleOfflineButtonAlertUpdate() {
  if (_alertTimer) return;
  _alertTimer = window.setTimeout(() => {
    _alertTimer = 0;
    updateOfflineButtonAlert().catch(() => {});
  }, 80);
}

async function updateOfflineButtonAlert() {
  const btn = document.getElementById('offline-btn');
  if (!btn) return;

  const mgr = window.OfflineManager;
  if (!mgr) return;

  // Подсветка активного R1
  btn.classList.toggle('active', mgr.getMode?.() === 'R1');

  let hasAlert = false;
  try {
    const getAll = await loadGetAllTrackMetas();
    if (getAll) {
      const metas = await getAll();
      hasAlert = Array.isArray(metas) && metas.some((m) => m?.needsReCache || m?.needsUpdate);
    }
  } catch {}

  let alertEl = btn.querySelector('.offline-btn-alert');

  if (hasAlert) {
    if (!alertEl) {
      alertEl = document.createElement('span');
      alertEl.className = 'offline-btn-alert';
      alertEl.textContent = '!';
      alertEl.title = 'Есть треки для обновления';
      btn.prepend(alertEl);

      // ТЗ 12.1: по нажатию на "!" — toast двойной длительности, НЕ открывать модалку
      alertEl.addEventListener('click', (e) => {
        e.stopPropagation();
        window.NotificationSystem?.show?.('Есть треки для обновления', 'info', 6000);
      });
    }
    alertEl.style.display = '';
  } else {
    if (alertEl) alertEl.style.display = 'none';
  }
}

/* ──────────────────────────────────────────────────────────
 * Init
 * ────────────────────────────────────────────────────────── */

export function initOfflineIndicators() {
  injectCSS();

  // первичный рендер кнопки
  scheduleOfflineButtonAlertUpdate();

  window.addEventListener('offline:uiChanged', scheduleOfflineButtonAlertUpdate);
  window.addEventListener('netPolicy:changed', scheduleOfflineButtonAlertUpdate);

  // изменения состояния офлайна => обновляем индикаторы + "!"
  window.addEventListener('offline:stateChanged', () => {
    refreshAllIndicators().catch(() => {});
  });

  // точечные события
  window.addEventListener('offline:trackCached', (e) => {
    const uid = String(e.detail?.uid || '').trim();
    if (uid) {
      const el = document.querySelector(`.offline-ind[data-uid="${CSS.escape(uid)}"]`);
      if (el) refreshOne(el).catch(() => {});
      else refreshAllIndicators().catch(() => {});
    } else {
      refreshAllIndicators().catch(() => {});
    }
    scheduleOfflineButtonAlertUpdate();
  });

  window.addEventListener('offline:downloadStart', (e) => {
    const uid = String(e.detail?.uid || '').trim();
    if (!uid) return;
    const el = document.querySelector(`.offline-ind[data-uid="${CSS.escape(uid)}"]`);
    if (el) refreshOne(el).catch(() => {});
  });

  if (document.readyState !== 'loading') injectOfflineIndicators();
  else document.addEventListener('DOMContentLoaded', () => injectOfflineIndicators());
}

export default {
  initOfflineIndicators,
  injectOfflineIndicators,
  injectIndicator,
  refreshAllIndicators
};
