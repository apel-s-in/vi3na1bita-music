/**
 * offline-indicators.js — Индикатор 🔒/☁ в трек-листе (ТЗ П.7).
 *
 * Визуальные состояния (П.7.2):
 *   none (место есть)        → 🔒 серый, opacity 0.4
 *   none (нет места)         → 🔒 серый, opacity 0.2
 *   pinned_downloading       → 🔒 жёлтый мигающий
 *   pinned                   → 🔒 жёлтый
 *   cloud                    → ☁ голубой
 *   cloud_downloading        → 🔒 серый, opacity 0.4 (ТЗ: «серый 🔒»)
 *
 * Событийная модель обновления (не таймер — П.7.4).
 */

import offlineManager from '../offline/offline-manager.js';

const ICON_LOCK = '🔒';
const ICON_CLOUD = '☁';
const DATA_ATTR = 'data-offline-uid';

/* ═══════ CSS (инжектим один раз) ═══════ */

let _cssInjected = false;

function _injectCSS() {
  if (_cssInjected) return;
  _cssInjected = true;

  const style = document.createElement('style');
  style.textContent = `
    .offline-ind {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 1.4em;
      min-width: 1.4em;
      cursor: pointer;
      user-select: none;
      font-size: 0.85em;
      transition: opacity 0.2s;
      margin-right: 2px;
      flex-shrink: 0;
    }

    /* Состояния */
    .offline-ind--none {
      opacity: 0.4;
    }
    .offline-ind--no-space {
      opacity: 0.2;
    }
    .offline-ind--pinned {
      opacity: 1;
      filter: brightness(1.1);
    }
    .offline-ind--pinned .offline-ind__icon {
      color: #ffc107; /* жёлтый/золотой */
    }
    .offline-ind--downloading {
      opacity: 1;
      animation: offlineIndBlink 1s ease-in-out infinite;
    }
    .offline-ind--downloading .offline-ind__icon {
      color: #ffc107;
    }
    .offline-ind--cloud {
      opacity: 1;
    }
    .offline-ind--cloud .offline-ind__icon {
      color: #64b5f6; /* голубой */
    }
    .offline-ind--cloud-downloading {
      opacity: 0.4;
    }

    @keyframes offlineIndBlink {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }
  `;
  document.head.appendChild(style);
}

/* ═══════ Создание/обновление одного индикатора ═══════ */

function _createIndicator(uid) {
  const el = document.createElement('span');
  el.className = 'offline-ind offline-ind--none';
  el.setAttribute(DATA_ATTR, uid);
  el.innerHTML = `<span class="offline-ind__icon">${ICON_LOCK}</span>`;
  return el;
}

async function _updateIndicator(el) {
  const uid = el.getAttribute(DATA_ATTR);
  if (!uid) return;

  const state = await offlineManager.getTrackOfflineState(uid);
  const iconEl = el.querySelector('.offline-ind__icon');
  if (!iconEl) return;

  /* Снять все модификаторы */
  el.className = 'offline-ind';

  switch (state.cacheKind) {
    case 'pinned':
      el.classList.add('offline-ind--pinned');
      iconEl.textContent = ICON_LOCK;
      break;

    case 'pinned_downloading':
      el.classList.add('offline-ind--downloading');
      iconEl.textContent = ICON_LOCK;
      break;

    case 'cloud':
      el.classList.add('offline-ind--cloud');
      iconEl.textContent = ICON_CLOUD;
      break;

    case 'cloud_downloading':
      /* ТЗ П.7.2: Cloud, загружается → серый 🔒 */
      el.classList.add('offline-ind--cloud-downloading');
      iconEl.textContent = ICON_LOCK;
      break;

    case 'none':
    default:
      if (state.spaceOk === false) {
        el.classList.add('offline-ind--no-space');
      } else {
        el.classList.add('offline-ind--none');
      }
      iconEl.textContent = ICON_LOCK;
      break;
  }
}

/* ═══════ Клик-обработчик ═══════ */

async function _onClick(e) {
  const el = e.currentTarget;
  const uid = el.getAttribute(DATA_ATTR);
  if (!uid) return;

  e.stopPropagation(); /* Не запускать воспроизведение трека */

  const state = await offlineManager.getTrackOfflineState(uid);

  switch (state.cacheKind) {
    case 'none':
    case 'cloud_downloading':
      /* ТЗ П.4.3 / П.7.2: серый 🔒 → начать пиннинг */
      if (state.spaceOk === false) {
        /* ТЗ П.2: нет места → toast */
        window.NotificationSystem?.warning?.(
          'Недостаточно места на устройстве. Освободите память для офлайн-кэша.'
        );
        return;
      }
      await offlineManager.togglePinned(uid);
      break;

    case 'pinned':
    case 'pinned_downloading':
      /* ТЗ П.4.4: жёлтый 🔒 → снять пиннинг */
      await offlineManager.togglePinned(uid);
      break;

    case 'cloud':
      /* ТЗ П.5.5: голубой ☁ → cloud-menu */
      _showCloudMenu(el, uid);
      break;
  }
}

/* ═══════ Cloud menu (ТЗ П.5.5) ═══════ */

let _activeMenu = null;

function _showCloudMenu(anchorEl, uid) {
  _closeCloudMenu();

  const menu = document.createElement('div');
  menu.className = 'cloud-menu';
  menu.innerHTML = `
    <div class="cloud-menu__item cloud-menu__pin">Закрепить 🔒</div>
    <div class="cloud-menu__item cloud-menu__delete">Удалить из кэша</div>
  `;

  /* Позиционирование рядом с иконкой */
  const rect = anchorEl.getBoundingClientRect();
  menu.style.cssText = `
    position: fixed;
    left: ${rect.right + 4}px;
    top: ${rect.top - 4}px;
    z-index: 10000;
    background: var(--bg-secondary, #2a2a2a);
    border: 1px solid var(--border-color, #444);
    border-radius: 6px;
    padding: 4px 0;
    box-shadow: 0 4px 12px rgba(0,0,0,0.4);
    min-width: 160px;
  `;

  /* Закрепить 🔒 (ТЗ П.5.5 пункт 1) */
  menu.querySelector('.cloud-menu__pin').addEventListener('click', async (e) => {
    e.stopPropagation();
    _closeCloudMenu();
    await offlineManager.togglePinned(uid); /* cloud → pinned */
  });

  /* Удалить из кэша (ТЗ П.5.5 пункт 2) */
  menu.querySelector('.cloud-menu__delete').addEventListener('click', async (e) => {
    e.stopPropagation();
    _closeCloudMenu();

    const ok = confirm('Удалить трек из кэша? Статистика облачка будет сброшена.');
    if (!ok) return;

    await offlineManager.removeCached(uid);
  });

  document.body.appendChild(menu);
  _activeMenu = menu;

  /* Закрыть по клику вне меню */
  setTimeout(() => {
    document.addEventListener('click', _onDocClick, { once: true });
  }, 10);
}

function _onDocClick() {
  _closeCloudMenu();
}

function _closeCloudMenu() {
  if (_activeMenu) {
    _activeMenu.remove();
    _activeMenu = null;
  }
}

/* ═══════ Cloud menu CSS ═══════ */

function _injectCloudMenuCSS() {
  const style = document.createElement('style');
  style.textContent = `
    .cloud-menu__item {
      padding: 8px 16px;
      cursor: pointer;
      font-size: 0.9em;
      color: var(--text-primary, #eee);
      white-space: nowrap;
      transition: background 0.15s;
    }
    .cloud-menu__item:hover {
      background: var(--bg-hover, rgba(255,255,255,0.1));
    }
    .cloud-menu__delete {
      color: #ef5350;
    }
  `;
  document.head.appendChild(style);
}

/* ═══════ Инжекция индикаторов в трек-лист ═══════ */

/**
 * Вставить индикаторы во все треки внутри контейнера.
 * Вызывается из albums.js и favorites-view.js после рендера.
 *
 * @param {HTMLElement} container — контейнер с элементами .track[data-uid]
 */
export async function injectOfflineIndicators(container) {
  if (!container) return;
  _injectCSS();
  _injectCloudMenuCSS();

  const trackEls = container.querySelectorAll('.track[data-uid]');

  for (const trackEl of trackEls) {
    const uid = trackEl.dataset.uid;
    if (!uid) continue;

    /* Не дублировать если уже есть */
    if (trackEl.querySelector(`.offline-ind[${DATA_ATTR}="${uid}"]`)) continue;

    const ind = _createIndicator(uid);

    /* ТЗ П.7.1: Вставить ПЕРЕД .tnum */
    const tnum = trackEl.querySelector('.tnum');
    if (tnum) {
      trackEl.insertBefore(ind, tnum);
    } else {
      trackEl.prepend(ind);
    }

    /* Клик-обработчик */
    ind.addEventListener('click', _onClick);

    /* Начальное состояние */
    await _updateIndicator(ind);
  }
}

/**
 * Обновить состояние индикатора для конкретного uid.
 * Вызывается событийно (не по таймеру — ТЗ П.7.4).
 */
export async function refreshIndicator(uid) {
  const els = document.querySelectorAll(`.offline-ind[${DATA_ATTR}="${uid}"]`);
  for (const el of els) {
    await _updateIndicator(el);
  }
}

/**
 * Обновить все видимые индикаторы.
 */
export async function refreshAllIndicators() {
  const els = document.querySelectorAll(`.offline-ind[${DATA_ATTR}]`);
  for (const el of els) {
    await _updateIndicator(el);
  }
}

/* ═══════ Событийные подписки (ТЗ П.7.4) ═══════ */

window.addEventListener('offline:stateChanged', () => {
  refreshAllIndicators();
});

window.addEventListener('offline:trackCached', (e) => {
  if (e.detail?.uid) refreshIndicator(e.detail.uid);
});

window.addEventListener('offline:downloadStart', (e) => {
  if (e.detail?.uid) refreshIndicator(e.detail.uid);
});

