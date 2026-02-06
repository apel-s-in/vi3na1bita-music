/**
 * offline-indicators.js — 🔒/☁ иконки в трек-листе.
 *
 * ТЗ: Приложение П.7.1–П.7.4, П.4.2–П.4.4, П.5.5
 *
 * Экспорт:
 *   - initOfflineIndicators()      — подписка на события, вызвать один раз при старте
 *   - injectOfflineIndicators(container) — вставить иконки во все .track внутри container
 *   - injectIndicator(trackEl)     — вставить/обновить иконку в одном .track элементе
 *   - refreshAllIndicators()       — обновить все видимые иконки
 */

import offlineManager, { getOfflineManager } from '../offline/offline-manager.js';

/* ═══════ CSS (инжектируется один раз) ═══════ */

let _cssInjected = false;

function injectCSS() {
  if (_cssInjected) return;
  _cssInjected = true;

  const style = document.createElement('style');
  style.textContent = `
    /* ТЗ П.7.1: offline-ind перед .tnum */
    .offline-ind {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      min-width: 24px;
      height: 24px;
      font-size: 14px;
      cursor: pointer;
      user-select: none;
      -webkit-tap-highlight-color: transparent;
      transition: opacity 0.2s, color 0.2s;
      flex-shrink: 0;
      margin-right: 2px;
      position: relative;
    }

    /* Состояние: нет кэша, место есть (ТЗ П.7.2: серый, 0.4) */
    .offline-ind--none {
      color: #888;
      opacity: 0.4;
    }

    /* Состояние: нет кэша, места нет (ТЗ П.7.2: серый, 0.2) */
    .offline-ind--nospace {
      color: #888;
      opacity: 0.2;
    }

    /* Состояние: pinned, загружен (ТЗ П.7.2: жёлтый, 1.0) */
    .offline-ind--pinned {
      color: #f5c842;
      opacity: 1.0;
      text-shadow: 0 0 4px rgba(245, 200, 66, 0.4);
    }

    /* Состояние: pinned, загружается (ТЗ П.7.2: жёлтый мигающий, 1.0) */
    .offline-ind--pinned-loading {
      color: #f5c842;
      opacity: 1.0;
      animation: offlineIndBlink 1.2s ease-in-out infinite;
    }

    /* Состояние: cloud, загружен (ТЗ П.7.2: голубой, 1.0) */
    .offline-ind--cloud {
      color: #5bc0de;
      opacity: 1.0;
    }

    /* Состояние: cloud_loading — показываем серый замок */
    .offline-ind--cloud-loading {
      color: #888;
      opacity: 0.4;
    }

    @keyframes offlineIndBlink {
      0%, 100% { opacity: 1.0; }
      50% { opacity: 0.4; }
    }

    /* ─── Cloud menu popup (ТЗ П.5.5) ─── */
    .cloud-menu {
      position: absolute;
      top: 100%;
      left: 0;
      z-index: 9999;
      background: #1a1a2e;
      border: 1px solid rgba(255,255,255,0.15);
      border-radius: 8px;
      padding: 4px 0;
      min-width: 180px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.6);
      font-size: 13px;
    }

    .cloud-menu__item {
      padding: 8px 14px;
      color: #e0e0e0;
      cursor: pointer;
      white-space: nowrap;
      transition: background 0.15s;
    }
    .cloud-menu__item:hover {
      background: rgba(255,255,255,0.08);
    }
    .cloud-menu__item--danger {
      color: #ff6b6b;
    }
  `;
  document.head.appendChild(style);
}

/* ═══════ Создание / обновление иконки ═══════ */

/**
 * injectIndicator(trackEl) — вставить или обновить иконку для одного .track.
 * trackEl должен иметь data-uid.
 */
export async function injectIndicator(trackEl) {
  if (!trackEl) return;

  const uid = trackEl.dataset?.uid;
  if (!uid) return;

  injectCSS();

  const mgr = getOfflineManager();
  const state = await mgr.getTrackOfflineState(uid);

  let ind = trackEl.querySelector('.offline-ind');

  if (!ind) {
    ind = document.createElement('span');
    ind.className = 'offline-ind';

    /* ТЗ П.7.1: offline-ind добавляется перед .tnum */
    const tnum = trackEl.querySelector('.tnum');
    if (tnum) {
      trackEl.insertBefore(ind, tnum);
    } else {
      trackEl.prepend(ind);
    }
  }

  /* Обновить визуал */
  _applyState(ind, state, uid);

  /* Привязать клик (один раз) */
  if (!ind._offlineClickBound) {
    ind._offlineClickBound = true;
    ind.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      _handleClick(ind, uid);
    });
  }
}

/**
 * Применить визуальное состояние к иконке.
 */
function _applyState(ind, state, uid) {
  /* Сбросить все классы состояния */
  ind.className = 'offline-ind';
  ind.title = '';

  const mgr = getOfflineManager();
  const spaceOk = mgr.isSpaceOk();

  switch (state.status) {
    case 'pinned':
      if (state.downloading) {
        ind.classList.add('offline-ind--pinned-loading');
        ind.textContent = '🔒';
        ind.title = 'Закреплён (загружается…)';
      } else {
        ind.classList.add('offline-ind--pinned');
        ind.textContent = '🔒';
        ind.title = 'Закреплён офлайн';
      }
      break;

    case 'cloud':
      ind.classList.add('offline-ind--cloud');
      ind.textContent = '☁';
      ind.title = `Облачный кэш (${state.daysLeft || '?'} дн.)`;
      break;

    case 'cloud_loading':
      ind.classList.add('offline-ind--cloud-loading');
      ind.textContent = '🔒';
      ind.title = 'Облачный кэш (загружается…)';
      break;

    default:
      /* none / transient / dynamic */
      if (spaceOk) {
        ind.classList.add('offline-ind--none');
      } else {
        ind.classList.add('offline-ind--nospace');
      }
      ind.textContent = '🔒';
      ind.title = spaceOk ? 'Нажмите чтобы закрепить офлайн' : 'Недостаточно места';
      break;
  }

  /* Сохраняем текущее состояние для обработчика клика */
  ind._offlineState = state;
  ind._uid = uid;
}

/* ═══════ Обработка кликов ═══════ */

async function _handleClick(ind, uid) {
  const state = ind._offlineState;
  if (!state) return;

  const mgr = getOfflineManager();

  switch (state.status) {
    case 'none':
    case 'cloud_loading':
    case 'transient':
    case 'dynamic': {
      /* ТЗ П.4.3: Клик по серому 🔒 → пиннинг */
      if (!mgr.isSpaceOk()) {
        window.NotificationSystem?.warning?.('Недостаточно места на устройстве. Освободите память для офлайн-кэша.');
        return;
      }
      await mgr.togglePinned(uid);
      await _refreshOne(ind, uid);
      break;
    }

    case 'pinned': {
      /* ТЗ П.4.4: Клик по жёлтому 🔒 → снятие пиннинга */
      await mgr.togglePinned(uid);
      await _refreshOne(ind, uid);
      break;
    }

    case 'cloud': {
      /* ТЗ П.5.5: Клик по ☁ → cloud-menu */
      _showCloudMenu(ind, uid);
      break;
    }
  }
}

/* ═══════ Cloud Menu (ТЗ П.5.5) ═══════ */

let _activeCloudMenu = null;

function _closeCloudMenu() {
  if (_activeCloudMenu) {
    _activeCloudMenu.remove();
    _activeCloudMenu = null;
  }
  document.removeEventListener('click', _onDocClickForMenu);
}

function _onDocClickForMenu(e) {
  if (_activeCloudMenu && !_activeCloudMenu.contains(e.target)) {
    _closeCloudMenu();
  }
}

function _showCloudMenu(ind, uid) {
  _closeCloudMenu();

  const menu = document.createElement('div');
  menu.className = 'cloud-menu';

  /* Пункт 1: Закрепить 🔒 */
  const pinItem = document.createElement('div');
  pinItem.className = 'cloud-menu__item';
  pinItem.textContent = '🔒 Закрепить';
  pinItem.addEventListener('click', async (e) => {
    e.stopPropagation();
    _closeCloudMenu();
    const mgr = getOfflineManager();
    await mgr.togglePinned(uid); /* cloud → pinned */
    await _refreshOne(ind, uid);
  });
  menu.appendChild(pinItem);

  /* Пункт 2: Удалить из кэша */
  const delItem = document.createElement('div');
  delItem.className = 'cloud-menu__item cloud-menu__item--danger';
  delItem.textContent = '🗑 Удалить из кэша';
  delItem.addEventListener('click', async (e) => {
    e.stopPropagation();
    _closeCloudMenu();

    /* Confirm (ТЗ П.5.5 пункт 2) */
    const ok = confirm('Удалить трек из кэша? Статистика облачка будет сброшена.');
    if (!ok) return;

    const mgr = getOfflineManager();
    await mgr.removeCached(uid);
    await _refreshOne(ind, uid);
  });
  menu.appendChild(delItem);

  /* Позиционируем относительно ind */
  ind.style.position = 'relative';
  ind.appendChild(menu);

  _activeCloudMenu = menu;

  /* Закрытие по клику вне меню */
  setTimeout(() => {
    document.addEventListener('click', _onDocClickForMenu);
  }, 10);
}

/* ═══════ Refresh helpers ═══════ */

async function _refreshOne(ind, uid) {
  const mgr = getOfflineManager();
  const state = await mgr.getTrackOfflineState(uid);
  _applyState(ind, state, uid);
}

/**
 * injectOfflineIndicators(container) — вставить иконки во все .track внутри container.
 */
export async function injectOfflineIndicators(container) {
  if (!container) container = document;
  injectCSS();

  const tracks = container.querySelectorAll('.track[data-uid]');
  const promises = [];
  for (const el of tracks) {
    promises.push(injectIndicator(el));
  }
  await Promise.all(promises);
}

/**
 * refreshAllIndicators() — обновить все видимые индикаторы.
 */
export async function refreshAllIndicators() {
  const indicators = document.querySelectorAll('.offline-ind');
  const promises = [];
  for (const ind of indicators) {
    const uid = ind._uid;
    if (uid) promises.push(_refreshOne(ind, uid));
  }
  await Promise.all(promises);
}

/**
 * initOfflineIndicators() — инициализация: подписка на события.
 * ТЗ П.7.4: Обновление по событиям, не по таймеру.
 */
export function initOfflineIndicators() {
  injectCSS();

  /* Подписка на события offline-manager */
  window.addEventListener('offline:stateChanged', () => {
    refreshAllIndicators();
  });

  window.addEventListener('offline:trackCached', (e) => {
    const uid = e.detail?.uid;
    if (!uid) return;
    /* Обновить конкретный индикатор */
    const ind = document.querySelector(`.offline-ind[data-uid="${uid}"]`) ||
                _findIndByUid(uid);
    if (ind) _refreshOne(ind, uid);
    else refreshAllIndicators();
  });

  window.addEventListener('offline:downloadStart', (e) => {
    const uid = e.detail?.uid;
    if (uid) {
      const ind = _findIndByUid(uid);
      if (ind) _refreshOne(ind, uid);
    }
  });

  /* Начальная инъекция для текущего DOM */
  injectOfflineIndicators(document);
}

/**
 * Найти индикатор по uid (через _uid поле).
 */
function _findIndByUid(uid) {
  const all = document.querySelectorAll('.offline-ind');
  for (const ind of all) {
    if (ind._uid === uid) return ind;
  }
  return null;
}

export default {
  initOfflineIndicators,
  injectOfflineIndicators,
  injectIndicator,
  refreshAllIndicators
};
