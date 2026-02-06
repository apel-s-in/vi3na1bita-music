/**
 * offline-indicators.js — Индикаторы 🔒/☁ в трек-листе.
 *
 * ТЗ П.7: 
 *   - Класс: offline-ind
 *   - Вставка: ПЕРЕД .tnum внутри .track[data-uid]
 *   - Всегда показывать (серый 🔒 по умолчанию)
 *   - Три состояния: серый 🔒 → жёлтый 🔒 → голубой ☁
 *   - Клик: серый→pin, жёлтый→unpin, голубой→cloud-menu
 */

import { getOfflineManager } from '../offline/offline-manager.js';
import { showCloudMenu } from './cloud-menu.js';

/* ═══════ CSS-классы по состояниям (ТЗ П.7.2) ═══════ */

const CLS = {
  BASE: 'offline-ind',
  NONE: 'offline-ind--none',
  PINNED: 'offline-ind--pinned',
  PINNED_LOADING: 'offline-ind--pinned-loading',
  CLOUD: 'offline-ind--cloud'
};

const ICONS = {
  LOCK: '🔒',
  CLOUD: '☁'
};

/* ═══════ injectIndicator ═══════ */

/**
 * Вставляет/обновляет индикатор для одного .track[data-uid] элемента.
 * @param {HTMLElement} trackEl — элемент .track[data-uid]
 */
export async function injectIndicator(trackEl) {
  if (!trackEl) return;
  const uid = trackEl.dataset?.uid;
  if (!uid) return;

  const mgr = getOfflineManager();
  const state = await mgr.getTrackOfflineState(uid);

  /* Найти или создать индикатор */
  let badge = trackEl.querySelector(`.${CLS.BASE}`);
  if (!badge) {
    badge = document.createElement('span');
    badge.className = CLS.BASE;
    badge.dataset.uid = uid;
    badge.setAttribute('role', 'button');
    badge.setAttribute('tabindex', '0');

    /* ТЗ П.7.1: вставить ПЕРЕД .tnum */
    const tnum = trackEl.querySelector('.tnum');
    if (tnum) {
      tnum.parentNode.insertBefore(badge, tnum);
    } else {
      /* fallback: в начало */
      trackEl.prepend(badge);
    }

    /* Навешиваем обработчик клика (один раз) */
    badge.addEventListener('click', _onIndicatorClick);
  }

  /* Обновить визуальное состояние */
  _updateBadgeVisual(badge, state);
}

/* ═══════ Обновление визуала ═══════ */

function _updateBadgeVisual(badge, state) {
  /* Снять все модификаторы */
  badge.classList.remove(CLS.NONE, CLS.PINNED, CLS.PINNED_LOADING, CLS.CLOUD);

  const { cacheKind, downloading, cachedComplete } = state;

  if (cacheKind === 'pinned') {
    if (downloading || cachedComplete < 100) {
      badge.classList.add(CLS.PINNED_LOADING);
      badge.textContent = ICONS.LOCK;
      badge.title = 'Закреплён 🔒 (загружается...)';
    } else {
      badge.classList.add(CLS.PINNED);
      badge.textContent = ICONS.LOCK;
      badge.title = 'Закреплён 🔒 (клик — открепить)';
    }
  } else if (cacheKind === 'cloud') {
    badge.classList.add(CLS.CLOUD);
    badge.textContent = ICONS.CLOUD;
    badge.title = 'В облаке ☁ (клик — меню)';
  } else {
    /* none — серый 🔒 (ТЗ П.7.2: всегда показываем) */
    badge.classList.add(CLS.NONE);
    badge.textContent = ICONS.LOCK;
    badge.title = 'Не кэшировано (клик — закрепить)';
  }

  /* Сохраняем текущее состояние в dataset для обработчика клика */
  badge.dataset.cacheKind = cacheKind;
}

/* ═══════ Обработчик клика (ТЗ П.4.2–П.4.4, П.5.5) ═══════ */

async function _onIndicatorClick(e) {
  e.stopPropagation();
  e.preventDefault();

  const badge = e.currentTarget;
  const uid = badge.dataset.uid;
  if (!uid) return;

  const kind = badge.dataset.cacheKind;
  const mgr = getOfflineManager();

  if (kind === 'cloud') {
    /* ТЗ: Голубой ☁ → cloud-menu (ЛЕВЫЙ клик!) */
    showCloudMenu(uid, badge);
  } else {
    /* Серый или жёлтый → togglePinned */
    await mgr.togglePinned(uid);
    /* Обновить этот индикатор */
    const trackEl = badge.closest('.track[data-uid]');
    if (trackEl) await injectIndicator(trackEl);
  }
}

/* ═══════ refreshAllIndicators ═══════ */

/**
 * Обновить все индикаторы на странице.
 * Ищет .track[data-uid] (ТЗ П.7.1).
 */
export async function refreshAllIndicators() {
  const tracks = document.querySelectorAll('.track[data-uid]');
  const promises = [];
  for (const el of tracks) {
    promises.push(injectIndicator(el));
  }
  await Promise.all(promises);
}

/* ═══════ Событийная модель (не таймер!) ═══════ */

let _listening = false;

export function startIndicatorListeners() {
  if (_listening) return;
  _listening = true;

  window.addEventListener('offline:stateChanged', () => {
    refreshAllIndicators();
  });

  /* Также обновляем при навигации/рендере треклиста */
  window.addEventListener('tracklist:rendered', () => {
    refreshAllIndicators();
  });

  /* MutationObserver для динамически добавленных .track */
  const observer = new MutationObserver((mutations) => {
    let hasNewTracks = false;
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType === 1) {
          if (node.matches?.('.track[data-uid]')) {
            injectIndicator(node);
            hasNewTracks = true;
          }
          const nested = node.querySelectorAll?.('.track[data-uid]');
          if (nested?.length) {
            nested.forEach(el => injectIndicator(el));
            hasNewTracks = true;
          }
        }
      }
    }
  });

  const container = document.querySelector('.tracklist, .album-tracks, #app, main, body');
  if (container) {
    observer.observe(container, { childList: true, subtree: true });
  }
}

/* ═══════ Bootstrap ═══════ */

export function initOfflineIndicators() {
  startIndicatorListeners();
  refreshAllIndicators();
}
