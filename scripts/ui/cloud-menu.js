/**
 * cloud-menu.js — Popup-меню при клике по голубому ☁
 *
 * ТЗ: Приложение «Pinned и Cloud», П.5.5
 *
 * Два пункта:
 * 1. «Закрепить 🔒» — pinned=true, cloud-статистика сохраняется
 * 2. «Удалить из кэша» — confirm → удалить аудио + сбросить cloud-статистику
 *
 * Зависимости:
 * - OfflineManager (pinTrack, removeCachedWithReset)
 * - refreshIndicator (offline-indicators.js)
 */

import { OfflineManager } from '../offline/offline-manager.js';
import { refreshIndicator } from './offline-indicators.js';

/* ── Состояние ────────────────────────────────────────── */

let _menuEl = null;     /* Текущий открытый popup DOM-элемент */
let _activeUid = null;  /* uid трека для которого открыто меню */

/* ── Утилиты ──────────────────────────────────────────── */

function _toast(msg) {
  if (typeof window.showToast === 'function') {
    window.showToast(msg);
  } else {
    console.log('[cloud-menu] toast:', msg);
  }
}

/* ── Закрытие меню ────────────────────────────────────── */

function _closeMenu() {
  if (_menuEl && _menuEl.parentNode) {
    _menuEl.parentNode.removeChild(_menuEl);
  }
  _menuEl = null;
  _activeUid = null;
  document.removeEventListener('click', _onOutsideClick, true);
}

/**
 * Закрытие по клику вне меню.
 */
function _onOutsideClick(e) {
  if (_menuEl && !_menuEl.contains(e.target)) {
    _closeMenu();
  }
}

/* ── Действия ─────────────────────────────────────────── */

/**
 * Пункт 1: «Закрепить 🔒» (П.5.5)
 * pinned = true, cloud-статистика НЕ сбрасывается.
 */
async function _actionPinFromCloud(uid) {
  _closeMenu();
  const result = await OfflineManager.pinTrack(uid);
  if (result.success) {
    _toast('Трек закреплён 🔒');
    refreshIndicator(uid);
    window.dispatchEvent(new CustomEvent('offline-state-changed', { detail: { uid } }));
  }
}

/**
 * Пункт 2: «Удалить из кэша» (П.5.5)
 * Confirm → удалить аудио → сбросить cloud-статистику.
 * Global stats НЕ трогаем.
 */
async function _actionRemoveFromCache(uid) {
  /* Confirm (П.5.5) */
  const confirmed = confirm('Удалить трек из кэша? Статистика облачка будет сброшена.');
  if (!confirmed) return;

  _closeMenu();
  const result = await OfflineManager.removeCachedWithReset(uid);
  if (result.success) {
    _toast('Трек удалён из кэша');
    refreshIndicator(uid);
    window.dispatchEvent(new CustomEvent('offline-state-changed', { detail: { uid } }));
  }
}

/* ── Построение popup-меню ────────────────────────────── */

/**
 * Строит DOM popup-меню и позиционирует рядом с anchorEl.
 */
function _buildMenu(uid, anchorEl) {
  const menu = document.createElement('div');
  menu.classList.add('cloud-menu-popup');

  /* Пункт 1: Закрепить 🔒 */
  const itemPin = document.createElement('div');
  itemPin.classList.add('cloud-menu-item');
  itemPin.textContent = 'Закрепить 🔒';
  itemPin.addEventListener('click', (e) => {
    e.stopPropagation();
    _actionPinFromCloud(uid);
  });
  menu.appendChild(itemPin);

  /* Пункт 2: Удалить из кэша */
  const itemRemove = document.createElement('div');
  itemRemove.classList.add('cloud-menu-item', 'cloud-menu-item--danger');
  itemRemove.textContent = 'Удалить из кэша';
  itemRemove.addEventListener('click', (e) => {
    e.stopPropagation();
    _actionRemoveFromCache(uid);
  });
  menu.appendChild(itemRemove);

  /* Позиционирование рядом с иконкой */
  document.body.appendChild(menu);
  const rect = anchorEl.getBoundingClientRect();
  menu.style.position = 'fixed';
  menu.style.left = `${rect.left}px`;
  menu.style.top = `${rect.bottom + 4}px`;
  menu.style.zIndex = '9999';

  /* Корректировка если выходит за правый край */
  const menuRect = menu.getBoundingClientRect();
  if (menuRect.right > window.innerWidth) {
    menu.style.left = `${window.innerWidth - menuRect.width - 8}px`;
  }
  /* Корректировка если выходит за нижний край */
  if (menuRect.bottom > window.innerHeight) {
    menu.style.top = `${rect.top - menuRect.height - 4}px`;
  }

  return menu;
}

/* ── Публичный API ────────────────────────────────────── */

/**
 * Показать cloud-menu для трека uid рядом с DOM-элементом anchorEl.
 * Если меню уже открыто для этого uid — закрываем (toggle).
 */
export function showCloudMenu(uid, anchorEl) {
  /* Toggle: если меню для этого uid уже открыто — закрыть */
  if (_activeUid === uid && _menuEl) {
    _closeMenu();
    return;
  }

  /* Закрыть предыдущее если было */
  _closeMenu();

  _activeUid = uid;
  _menuEl = _buildMenu(uid, anchorEl);

  /* Закрытие по клику вне меню (с задержкой чтобы текущий клик не закрыл) */
  setTimeout(() => {
    document.addEventListener('click', _onOutsideClick, true);
  }, 0);
}
