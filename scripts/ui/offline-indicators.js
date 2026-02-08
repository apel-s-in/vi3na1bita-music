/**
 * scripts/ui/offline-indicators.js
 * Визуальная индикация 🔒 (Pinned) и ☁ (Cloud) в списках треков.
 *
 * ТЗ: Приложение П.7.1–П.7.4, П.4.2–П.4.4, П.5.5, П.12.1
 */

import { getOfflineManager } from '../offline/offline-manager.js';

/* CSS стили (offline-ind, cloud-menu) должны быть в main.css */
function injectCSS() { /* no-op */ }

const $all = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/* ═══════ INJECTOR ═══════ */

/**
 * Вставить или обновить иконку для одного .track элемента.
 */
export async function injectIndicator(trackEl) {
  if (!trackEl) return;

  const uid = String(trackEl.dataset?.uid || '').trim();
  if (!uid) return;

  injectCSS();
  const mgr = getOfflineManager();
  
  // Получаем расширенное состояние из OfflineManager
  const state = await mgr.getTrackOfflineState(uid);

  let ind = trackEl.querySelector('.offline-ind');
  if (!ind) {
    ind = document.createElement('span');
    ind.className = 'offline-ind';

    // ТЗ П.5.3: offline-ind добавляется перед .tnum
    const tnum = trackEl.querySelector('.tnum');
    if (tnum) trackEl.insertBefore(ind, tnum);
    else trackEl.prepend(ind);

    // Единый слушатель, логика внутри _handleClick
    ind.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      _handleClick(ind).catch(() => {});
    });
  }

  ind.dataset.uid = uid;
  ind._uid = uid; // Fast access
  ind._offlineState = state; // Cache state for click handler

  await _applyState(ind, state);
}

/**
 * Применить визуальное состояние (CSS классы и Title).
 */
async function _applyState(ind, state) {
  ind.className = 'offline-ind';
  ind.title = '';
  ind.textContent = '';

  const mgr = getOfflineManager();
  const spaceOk = await _spaceOk(mgr);

  switch (state?.status) {
    // 1. PINNED (Замочек)
    case 'pinned':
      ind.textContent = '🔒';
      if (state.downloading) {
        // ТЗ 5.4: Жёлтый мигающий
        ind.classList.add('offline-ind--pinned-loading');
        ind.title = 'Закреплён (загружается…)';
      } else {
        // ТЗ 5.4: Жёлтый
        ind.classList.add('offline-ind--pinned');
        ind.title = 'Закреплён офлайн';
      }
      break;

    // 2. CLOUD (Облачко)
    case 'cloud':
      // ТЗ 5.4: Голубое облачко ТОЛЬКО если 100% готово
      ind.classList.add('offline-ind--cloud');
      ind.textContent = '☁';
      ind.title = `Облачный кэш (осталось ${state.daysLeft || '?'} дн.)`;
      break;

    // 3. CLOUD LOADING / TRANSIENT / NONE (Серый замочек)
    case 'cloud_loading':
    case 'transient':
    case 'none':
    default:
      // ТЗ 5.4: Во всех остальных случаях — серый замочек
      ind.textContent = '🔒';
      // Проверка места для прозрачности (ТЗ 5.4 opacity 0.2 vs 0.4)
      ind.classList.add(spaceOk ? 'offline-ind--none' : 'offline-ind--nospace');
      
      if (state?.status === 'cloud_loading') {
        ind.title = 'Облачный кэш (загружается…) — нажмите чтобы закрепить';
      } else if (!spaceOk) {
        ind.title = 'Недостаточно места на устройстве';
      } else {
        ind.title = 'Нажмите, чтобы закрепить офлайн';
      }
      break;
  }
}

// Хелпер проверки места (совместимость с API менеджера)
async function _spaceOk(mgr) {
  try {
    if (typeof mgr?.hasSpace === 'function') return await mgr.hasSpace();
    if (typeof mgr?.isSpaceOk === 'function') return await mgr.isSpaceOk();
  } catch {}
  return true;
}

/* ═══════ CLICK HANDLER ═══════ */

async function _handleClick(ind) {
  const uid = String(ind?._uid || '').trim();
  const state = ind?._offlineState;
  if (!uid || !state) return;

  const mgr = getOfflineManager();

  // Логика кликов (ТЗ 5.5, 5.6, 6.6)
  switch (state.status) {
    // Серый замок: Начать пиннинг
    case 'none':
    case 'transient':
    case 'cloud_loading': {
      const ok = await _spaceOk(mgr);
      if (!ok) {
        // ТЗ 5.2: Toast если нет места
        window.NotificationSystem?.show?.(
          'Недостаточно места на устройстве. Освободите память для офлайн-кэша.', 
          'warning'
        );
        return;
      }
      await mgr.togglePinned(uid); // none -> pinned
      await _refreshOne(ind);
      return;
    }

    // Жёлтый замок: Снять пиннинг (станет cloud)
    case 'pinned':
      await mgr.togglePinned(uid); // pinned -> cloud
      await _refreshOne(ind);
      return;

    // Голубое облачко: Меню
    case 'cloud':
      _showCloudMenu(ind, uid);
      return;
  }
}

/* ═══════ CLOUD POPUP MENU (ТЗ 6.6) ═══════ */

let _activeCloudMenu = null;

function _closeCloudMenu() {
  if (_activeCloudMenu) {
    _activeCloudMenu.remove();
    _activeCloudMenu = null;
  }
}

function _showCloudMenu(ind, uid) {
  _closeCloudMenu();

  const menu = document.createElement('div');
  menu.className = 'cloud-menu';
  // Базовые стили inline для надежности, детальные в CSS
  Object.assign(menu.style, { position: 'fixed', zIndex: '99999' });

  menu.innerHTML = `
    <div class="cloud-menu__item" data-action="pin">🔒 Закрепить</div>
    <div class="cloud-menu__item cloud-menu__item--danger" data-action="del">🗑 Удалить из кэша</div>
  `;

  menu.addEventListener('click', async (e) => {
    e.stopPropagation();
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (!action) return;

    _closeCloudMenu();
    const mgr = getOfflineManager();

    if (action === 'pin') {
      // Пункт 1: Закрепить (cloud -> pinned)
      await mgr.togglePinned(uid);
      await _refreshOne(ind);
    } else if (action === 'del') {
      // Пункт 2: Удалить (с confirm)
      if (window.Modals?.confirm) {
        window.Modals.confirm({
          title: 'Удалить из кэша?',
          textHtml: 'Статистика облачка будет сброшена.<br>Global-статистика останется.',
          confirmText: 'Удалить',
          cancelText: 'Отмена',
          onConfirm: async () => {
            await mgr.removeCached(uid);
            await _refreshOne(ind);
          }
        });
      }
    }
  });

  document.body.appendChild(menu);
  _activeCloudMenu = menu;
  _positionMenu(ind, menu);

  // Закрытие по клику вне
  setTimeout(() => {
    const clickOutside = (e) => {
      if (_activeCloudMenu && !_activeCloudMenu.contains(e.target)) {
        _closeCloudMenu();
        document.removeEventListener('click', clickOutside);
      }
    };
    document.addEventListener('click', clickOutside);
  }, 50);
}

function _positionMenu(target, menu) {
  const rect = target.getBoundingClientRect();
  const menuH = 80; // approx
  const bottomSpace = window.innerHeight - rect.bottom;
  
  // Если снизу мало места, показываем над иконкой
  if (bottomSpace < menuH + 20) {
    menu.style.bottom = (window.innerHeight - rect.top + 5) + 'px';
  } else {
    menu.style.top = (rect.bottom + 5) + 'px';
  }
  
  // По горизонтали стараемся выровнять по левому краю, но не за экран
  let left = rect.left;
  if (left + 150 > window.innerWidth) left = window.innerWidth - 160;
  menu.style.left = left + 'px';
}

/* ═══════ UPDATE HELPERS ═══════ */

async function _refreshOne(ind) {
  const uid = String(ind?._uid || '').trim();
  if (!uid) return;
  const mgr = getOfflineManager();
  const state = await mgr.getTrackOfflineState(uid);
  ind._offlineState = state;
  await _applyState(ind, state);
}

/* ═══════ PUBLIC API ═══════ */

export async function injectOfflineIndicators(container) {
  injectCSS();
  const root = container || document;
  const tracks = $all('.track[data-uid]', root);
  await Promise.all(tracks.map(injectIndicator));
}

export async function refreshAllIndicators() {
  const inds = $all('.offline-ind');
  await Promise.all(inds.map(_refreshOne));
  _updateMainOfflineButton(); // Also check main button alert
}

/**
 * ТЗ 12.1: Индикатор "!" на кнопке OFFLINE.
 */
async function _updateMainOfflineButton() {
  const btn = document.getElementById('offline-btn');
  if (!btn) return;

  const mgr = window.OfflineManager;
  if (!mgr) return;

  // Подсветка активного R1
  btn.classList.toggle('active', mgr.getMode?.() === 'R1');

  // Проверка needsReCache / needsUpdate
  let hasAlert = false;
  try {
    const { getAllTrackMetas } = await import('../offline/cache-db.js');
    const metas = await getAllTrackMetas();
    hasAlert = metas.some(m => m.needsReCache || m.needsUpdate);
  } catch {}

  let alertEl = btn.querySelector('.offline-btn-alert');
  
  if (hasAlert) {
    if (!alertEl) {
      alertEl = document.createElement('span');
      alertEl.className = 'offline-btn-alert';
      alertEl.textContent = '!';
      alertEl.title = 'Есть треки для обновления';
      btn.prepend(alertEl);
      
      // ТЗ 12.1: По нажатию на "!" — toast двойной длительности (а не открытие модалки)
      alertEl.addEventListener('click', (e) => {
        e.stopPropagation(); // Не открывать модалку
        window.NotificationSystem?.show?.('Есть треки для обновления', 'info', 6000);
      });
    }
    alertEl.style.display = '';
  } else {
    if (alertEl) alertEl.style.display = 'none';
  }
}

/* ═══════ INIT ═══════ */

export function initOfflineIndicators() {
  injectCSS();
  
  // Первичный рендер кнопки
  _updateMainOfflineButton();

  // Слушатели глобальных событий
  window.addEventListener('offline:uiChanged', _updateMainOfflineButton);
  window.addEventListener('netPolicy:changed', _updateMainOfflineButton);
  
  window.addEventListener('offline:stateChanged', () => {
    refreshAllIndicators().catch(() => {});
  });

  window.addEventListener('offline:trackCached', (e) => {
    // Оптимизация: обновляем конкретный индикатор, если знаем uid
    const uid = e.detail?.uid;
    if (uid) {
      const el = document.querySelector(`.offline-ind[data-uid="${CSS.escape(uid)}"]`);
      if (el) _refreshOne(el).catch(()=>{});
      else refreshAllIndicators().catch(()=>{}); // Fallback
    } else {
      refreshAllIndicators().catch(()=>{});
    }
    _updateMainOfflineButton();
  });

  // Обновляем "мигание" при старте загрузки
  window.addEventListener('offline:downloadStart', (e) => {
    const uid = e.detail?.uid;
    if (uid) {
      const el = document.querySelector(`.offline-ind[data-uid="${CSS.escape(uid)}"]`);
      if (el) _refreshOne(el).catch(()=>{});
    }
  });

  // Запуск инъекции (если DOM уже готов)
  if (document.readyState !== 'loading') injectOfflineIndicators();
  else document.addEventListener('DOMContentLoaded', () => injectOfflineIndicators());
}

export default {
  initOfflineIndicators,
  injectOfflineIndicators,
  injectIndicator,
  refreshAllIndicators
};
