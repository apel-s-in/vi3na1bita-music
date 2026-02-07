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

/* CSS определён в styles/main.css — инъекция не нужна */
function injectCSS() { /* no-op: стили в main.css */ }

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

  /* Обновить визуал и data-uid для CSS-селекторов */
  ind.dataset.uid = uid;
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
        // (6.2 Fix) Если уже качается как cloud, просто меняем статус на pinned
        // не отменяя загрузку, OfflineManager сам повысит приоритет при togglePinned
        await mgr.togglePinned(uid);
        await _refreshOne(ind, uid);
        break;
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
    if (_activeCloudMenu.parentNode) _activeCloudMenu.parentNode.removeChild(_activeCloudMenu);
    _activeCloudMenu = null;
  }
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
  delItem.addEventListener('click', (e) => {
    e.stopPropagation();
    _closeCloudMenu();

    /* Стилизованное подтверждение (ТЗ П.5.5 пункт 2) */
    if (window.Modals?.confirm) {
      window.Modals.confirm({
        title: 'Удалить из кэша?',
        textHtml: 'Статистика облачка будет сброшена.<br>Global-статистика останется.',
        confirmText: 'Удалить',
        cancelText: 'Отмена',
        onConfirm: async () => {
          const mgr = getOfflineManager();
          await mgr.removeCached(uid);
          await _refreshOne(ind, uid);
        }
      });
    }
  });
  menu.appendChild(delItem);

  /* Позиционируем через fixed в body, чтобы не перекрывалось плеером */
  menu.style.position = 'fixed';
  menu.style.zIndex = '99999';
  document.body.appendChild(menu);
  _activeCloudMenu = menu;

  /* Вычисляем позицию относительно иконки */
  const rect = ind.getBoundingClientRect();
  const menuH = 80; /* примерная высота меню */
  const playerH = 90; /* высота sticky-плеера внизу */
  const spaceBelow = window.innerHeight - rect.bottom - playerH;

  if (spaceBelow >= menuH) {
    /* Открываем вниз */
    menu.style.top = rect.bottom + 4 + 'px';
    menu.style.left = rect.left + 'px';
  } else {
    /* Открываем вверх */
    menu.style.bottom = (window.innerHeight - rect.top + 4) + 'px';
    menu.style.left = rect.left + 'px';
  }

  /* Не дать меню вылезти за правый край */
  requestAnimationFrame(() => {
    const mRect = menu.getBoundingClientRect();
    if (mRect.right > window.innerWidth - 8) {
      menu.style.left = (window.innerWidth - mRect.width - 8) + 'px';
    }
  });

  /* Закрытие по клику вне меню */
  setTimeout(() => {
    document.addEventListener('click', _onDocClickForMenu, { once: true });
  }, 50);
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
 * Обновление бейджа на кнопке OFFLINE внизу экрана
 */
async function _updateMainOfflineButton() {
  const btn = document.getElementById('offline-btn');
  if (!btn) return;

  const mgr = window._offlineManagerInstance;
  if (!mgr) return;

  const mode = mgr.getMode();
  btn.classList.toggle('active', mode === 'R1');

  // Fix #6.1: Check needsReCache / needsUpdate for "!" badge
  let hasAlert = false;
  try {
    const { getAllTrackMetas } = await import('../offline/cache-db.js');
    const metas = await getAllTrackMetas();
    hasAlert = metas.some(m => m.needsReCache || m.needsUpdate);
  } catch (e) {
    console.warn('[OfflineIndicators] Could not check alert state:', e);
  }

  // Toggle "!" indicator
  let alertEl = btn.querySelector('.offline-btn-alert');
  if (hasAlert) {
    if (!alertEl) {
      alertEl = document.createElement('span');
      alertEl.className = 'offline-btn-alert';
      alertEl.textContent = '!';
      alertEl.title = 'Есть треки для обновления';
      btn.prepend(alertEl);
    }
    alertEl.style.display = '';
  } else {
    if (alertEl) alertEl.style.display = 'none';
  }
}

/**
 * initOfflineIndicators() — инициализация: подписка на события.
 * ТЗ П.7.4: Обновление по событиям, не по таймеру.
 */
export function initOfflineIndicators() {
  injectCSS();
  
  /* Обновляем кнопку при старте и изменениях */
  _updateMainOfflineButton();
  window.addEventListener('offline:uiChanged', _updateMainOfflineButton);
  window.addEventListener('netPolicy:changed', _updateMainOfflineButton);

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
