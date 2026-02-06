/**
 * cloud-menu.js — Popup-меню для ☁ треков.
 *
 * ТЗ П.5.5: Два пункта: «Закрепить 🔒» и «Удалить из кэша».
 *   - «Удалить из кэша» → confirm → resetCloudStats
 *   - Открывается ЛЕВЫМ кликом по голубому ☁ индикатору
 */

import { getOfflineManager } from '../offline/offline-manager.js';

let _menuEl = null;

function _ensureMenu() {
  if (_menuEl) return _menuEl;

  _menuEl = document.createElement('div');
  _menuEl.className = 'cloud-menu';
  _menuEl.style.display = 'none';
  document.body.appendChild(_menuEl);

  /* Закрытие по клику вне меню */
  document.addEventListener('click', (e) => {
    if (_menuEl.style.display !== 'none' && !_menuEl.contains(e.target)) {
      hideCloudMenu();
    }
  }, true);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideCloudMenu();
  });

  return _menuEl;
}

/**
 * Показать cloud-menu рядом с anchor-элементом.
 * @param {string} uid — uid трека
 * @param {HTMLElement} anchorEl — элемент-якорь (индикатор ☁)
 */
export function showCloudMenu(uid, anchorEl) {
  const menu = _ensureMenu();
  const mgr = getOfflineManager();

  menu.innerHTML = '';
  menu.dataset.uid = uid;

  /* Пункт 1: Закрепить 🔒 */
  const pinBtn = document.createElement('button');
  pinBtn.className = 'cloud-menu__item';
  pinBtn.textContent = 'Закрепить 🔒';
  pinBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    hideCloudMenu();
    await mgr.togglePinned(uid);
  });
  menu.appendChild(pinBtn);

  /* Пункт 2: Удалить из кэша */
  const removeBtn = document.createElement('button');
  removeBtn.className = 'cloud-menu__item cloud-menu__item--danger';
  removeBtn.textContent = 'Удалить из кэша';
  removeBtn.addEventListener
('click', async (e) => {
    e.stopPropagation();
    hideCloudMenu();

    /* ТЗ П.5.5: confirm перед удалением */
    const ok = confirm('Удалить трек из кэша?\nCloud-статистика будет сброшена.');
    if (!ok) return;

    await mgr.removeCached(uid);
    /* removeCached уже вызывает resetCloudStats + deleteTrackCache + emit */
  });
  menu.appendChild(removeBtn);

  /* Позиционирование рядом с anchor */
  _positionMenu(menu, anchorEl);
  menu.style.display = 'block';
}

export function hideCloudMenu() {
  if (_menuEl) {
    _menuEl.style.display = 'none';
    _menuEl.innerHTML = '';
  }
}

function _positionMenu(menu, anchor) {
  if (!anchor) {
    menu.style.position = 'fixed';
    menu.style.top = '50%';
    menu.style.left = '50%';
    menu.style.transform = 'translate(-50%, -50%)';
    return;
  }

  const rect = anchor.getBoundingClientRect();
  menu.style.position = 'fixed';
  menu.style.transform = 'none';

  /* Показываем справа от иконки, с fallback влево если не влезает */
  let left = rect.right + 6;
  let top = rect.top;

  /* Проверяем, влезает ли меню по горизонтали */
  const menuWidth = 180; /* примерная ширина */
  if (left + menuWidth > window.innerWidth) {
    left = rect.left - menuWidth - 6;
  }

  /* Проверяем, влезает ли по вертикали */
  const menuHeight = 80;
  if (top + menuHeight > window.innerHeight) {
    top = window.innerHeight - menuHeight - 8;
  }

  if (top < 4) top = 4;
  if (left < 4) left = 4;

  menu.style.left = left + 'px';
  menu.style.top = top + 'px';
}
