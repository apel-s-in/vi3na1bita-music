/**
 * cloud-menu.js — Контекстное меню ☁/🔒 при правом клике на индикаторе.
 *
 * ТЗ: П.5.5, П.4.4
 */

import { getOfflineManager } from '../offline/offline-manager.js';

let _activeMenu = null;

export function showCloudMenu(uid, anchorEl, options = {}) {
  closeCloudMenu();

  const mgr = getOfflineManager();

  const menu = document.createElement('div');
  menu.className = 'cloud-context-menu';
  menu.setAttribute('data-uid', uid);

  /* ── Определяем состояние ── */
  mgr.getTrackOfflineState(uid).then(state => {
    const items = [];

    if (state.pinned) {
      items.push({
        label: '🔓 Открепить (убрать 🔒)',
        action: async () => {
          await mgr.togglePinned(uid);
          closeCloudMenu();
        }
      });
    } else {
      items.push({
        label: '🔒 Закрепить офлайн',
        action: async () => {
          await mgr.togglePinned(uid);
          closeCloudMenu();
        }
      });
    }

    if (state.cloud || state.pinned) {
      items.push({
        label: '🗑 Удалить из кэша',
        action: async () => {
          const ok = confirm(
            `Удалить кэшированный аудиофайл для этого трека?\n\n` +
            `Тип: ${state.pinned ? '🔒 Pinned' : '☁ Cloud'}\n` +
            `Качество: ${state.cachedVariant || '?'}\n\n` +
            `Трек останется в каталоге, но будет воспроизводиться только онлайн.`
          );
          if (ok) {
            await mgr.removeCached(uid);
            closeCloudMenu();
          }
        }
      });
    }

    items.push({
      label: 'ℹ️ Информация',
      action: async () => {
        const st = await mgr.getTrackOfflineState(uid);
        const meta = await (await import('../offline/cache-db.js')).getTrackMeta(uid);
        alert(
          `UID: ${uid}\n` +
          `Тип: ${st.cacheKind}\n` +
          `Качество: ${st.cachedVariant || 'нет'}\n` +
          `Прослушиваний: ${meta?.cloudFullListenCount || 0}\n` +
          `Нужен re-cache: ${st.needsReCache ? 'да' : 'нет'}\n` +
          `Скачивается: ${st.downloading ? 'да' : 'нет'}`
        );
        closeCloudMenu();
      }
    });

    /* ── Рендер ── */
    for (const item of items) {
      const el = document.createElement('div');
      el.className = 'cloud-context-menu__item';
      el.textContent = item.label;
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        item.action();
      });
      menu.appendChild(el);
    }

    /* ── Позиционирование ── */
    document.body.appendChild(menu);
    _activeMenu = menu;

    if (anchorEl) {
      const rect = anchorEl.getBoundingClientRect();
      menu.style.position = 'fixed';
      menu.style.left = `${rect.right + 4}px`;
      menu.style.top = `${rect.top}px`;
      menu.style.zIndex = '99999';
    }

    /* Закрытие по клику вне */
    setTimeout(() => {
      document.addEventListener('click', _outsideClickHandler, { once: true });
    }, 10);
  });
}

function _outsideClickHandler(e) {
  if (_activeMenu && !_activeMenu.contains(e.target)) {
    closeCloudMenu();
  }
}

export function closeCloudMenu() {
  if (_activeMenu) {
    _activeMenu.remove();
    _activeMenu = null;
  }
  document.removeEventListener('click', _outsideClickHandler);
}

export default { showCloudMenu, closeCloudMenu };
