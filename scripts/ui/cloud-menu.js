/**
 * cloud-menu.js — Popup-меню для ☁ индикатора.
 *
 * Два пункта:
 *   «Закрепить 🔒» → promoteCloudToPinned
 *   «Удалить из кэша» → removeFromCloudCache (с confirm)
 */

import offlineManager from './offline-manager.js';

let _menuEl = null;
let _currentUid = null;

function getOrCreateMenu() {
  if (_menuEl) return _menuEl;

  _menuEl = document.createElement('div');
  _menuEl.className = 'cloud-menu-popup';
  _menuEl.innerHTML = `
    <div class="cloud-menu-item" data-action="pin">
      <span>\u{1F512}</span> Закрепить
    </div>
    <div class="cloud-menu-item cloud-menu-delete" data-action="delete">
      <span>\u{1F5D1}</span> Удалить из кэша
    </div>
  `;

  _menuEl.addEventListener('click', onMenuClick);
  document.body.appendChild(_menuEl);

  // Закрытие по клику вне меню
  document.addEventListener('click', onOutsideClick);
  document.addEventListener('scroll', hideMenu, true);

  return _menuEl;
}

function onMenuClick(e) {
  const item = e.target.closest('.cloud-menu-item');
  if (!item || !_currentUid) return;

  e.stopPropagation();
  const action = item.dataset.action;

  if (action === 'pin') {
    offlineManager.promoteCloudToPinned(_currentUid);
    hideMenu();
  } else if (action === 'delete') {
    const ok = confirm('Удалить трек из кэша?\nСтатистика облачка будет сброшена.');
    if (ok) {
      offlineManager.removeFromCloudCache(_currentUid);
    }
    hideMenu();
  }
}

function onOutsideClick(e) {
  if (_menuEl && !_menuEl.contains(e.target)) {
    hideMenu();
  }
}

export function hideMenu() {
  if (_menuEl) {
    _menuEl.classList.remove('visible');
    _currentUid = null;
  }
}

/**
 * Показать cloud-menu рядом с элементом-якорем.
 */
export function showCloudMenu(uid, anchorEl) {
  if (!uid || !anchorEl) return;

  const menu = getOrCreateMenu();
  _currentUid = uid;

  // Позиционирование
  const rect = anchorEl.getBoundingClientRect();
  const menuW = 180;
  let left = rect.left;
  let top = rect.bottom + 4;

  // Не вылезать за правый край
  if (left + menuW > window.innerWidth) {
    left = window.innerWidth - menuW - 8;
  }
  // Не вылезать за нижний край — показать сверху
  if (top + 80 > window.innerHeight) {
    top = rect.top - 80;
  }

  menu.style.left = left + 'px';
  menu.style.top = top + 'px';
  menu.classList.add('visible');
}

export default { showCloudMenu, hideMenu };
