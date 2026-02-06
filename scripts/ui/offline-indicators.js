/**
 * offline-indicators.js — Индикаторы 🔒/☁ в трек-листе
 *
 * ТЗ: Приложение «Pinned и Cloud», П.7
 *
 * Отвечает за:
 * - Вставку элемента .offline-ind ПЕРЕД .tnum внутри .track[data-uid]
 * - Три визуальных состояния: серый 🔒, жёлтый 🔒, голубой ☁
 * - Клик-логику: серый→пиннинг, жёлтый→снятие, голубой→cloud-menu
 * - Событийное обновление (не по таймеру)
 *
 * Зависимости:
 * - OfflineManager (togglePinned, getTrackOfflineState, hasEnoughSpace)
 * - CloudMenu (showCloudMenu)
 * - showToast (UI)
 */

import { OfflineManager } from '../offline/offline-manager.js';
import { showCloudMenu } from './cloud-menu.js';

/* ── Константы ────────────────────────────────────────── */

const ICON_LOCK = '🔒';
const ICON_CLOUD = '☁';

/**
 * CSS-классы для визуальных состояний (П.7.2)
 * - none-has-space:   серый 🔒, opacity 0.4, кликабелен → пиннинг
 * - none-no-space:    серый 🔒, opacity 0.2, кликабелен → toast «нет места»
 * - pinned-loading:   жёлтый 🔒 мигающий, кликабелен → снять пиннинг
 * - pinned-complete:  жёлтый 🔒, кликабелен → снять пиннинг
 * - cloud-complete:   голубой ☁, кликабелен → cloud-menu
 * - cloud-loading:    серый 🔒, opacity 0.4, кликабелен → пиннинг
 * - transient:        серый 🔒, opacity 0.4, кликабелен → пиннинг
 */
const STATE_CLASS_PREFIX = 'offline-ind--';

/* ── Утилиты ──────────────────────────────────────────── */

/** Показать toast-уведомление (используем глобальную функцию если есть) */
function _toast(msg) {
  if (typeof window.showToast === 'function') {
    window.showToast(msg);
  } else {
    console.log('[offline-ind] toast:', msg);
  }
}

/* ── Определение визуального состояния ────────────────── */

/**
 * Возвращает объект { stateClass, icon, clickAction } для данного uid.
 *
 * clickAction: 'pin' | 'unpin' | 'cloud-menu' | 'no-space'
 *
 * Логика по П.7.2 + П.4.2:
 * - Pinned → жёлтый 🔒 (мигает если загружается)
 * - Cloud + cachedComplete=100% → голубой ☁
 * - Cloud загружается → серый 🔒 (как "нет кэша")
 * - Transient / Dynamic → серый 🔒
 * - Нет кэша, есть место → серый 🔒
 * - Нет кэша, нет места → серый 🔒 бледный
 */
function _resolveVisualState(uid) {
  const state = OfflineManager.getTrackOfflineState(uid);

  /* state = { cacheKind, cachedComplete, downloading }
   * cacheKind: 'pinned' | 'cloud' | 'transient' | 'dynamic' | 'fullOffline' | 'none'
   * cachedComplete: 0..100
   * downloading: boolean
   */

  const kind = state.cacheKind;
  const complete = state.cachedComplete === 100;
  const loading = state.downloading;

  /* Pinned (П.4.2) */
  if (kind === 'pinned') {
    if (loading || !complete) {
      return { stateClass: 'pinned-loading', icon: ICON_LOCK, clickAction: 'unpin' };
    }
    return { stateClass: 'pinned-complete', icon: ICON_LOCK, clickAction: 'unpin' };
  }

  /* Cloud полностью загружен (П.7.2: ☁ только при cloud=true И cachedComplete=100%) */
  if (kind === 'cloud' && complete) {
    return { stateClass: 'cloud-complete', icon: ICON_CLOUD, clickAction: 'cloud-menu' };
  }

  /* Cloud загружается — показываем серый 🔒 (П.7.2) */
  if (kind === 'cloud' && !complete) {
    return { stateClass: 'cloud-loading', icon: ICON_LOCK, clickAction: 'pin' };
  }

  /* Transient / Dynamic / FullOffline без pinned/cloud → серый 🔒 */
  if (kind === 'transient' || kind === 'dynamic' || kind === 'fullOffline') {
    return { stateClass: 'transient', icon: ICON_LOCK, clickAction: 'pin' };
  }

  /* Нет кэша (П.7.2) */
  const hasSpace = OfflineManager.hasEnoughSpace();
  if (hasSpace) {
    return { stateClass: 'none-has-space', icon: ICON_LOCK, clickAction: 'pin' };
  }
  return { stateClass: 'none-no-space', icon: ICON_LOCK, clickAction: 'no-space' };
}

/* ── Создание / обновление DOM-элемента ───────────────── */

/**
 * Гарантирует наличие элемента .offline-ind внутри .track[data-uid]
 * и ставит его ПЕРЕД .tnum (П.7.1).
 *
 * Возвращает span-элемент .offline-ind.
 */
function _ensureIndicatorElement(trackEl) {
  let ind = trackEl.querySelector('.offline-ind');
  if (ind) return ind;

  ind = document.createElement('span');
  ind.classList.add('offline-ind');

  /* Вставляем перед .tnum (П.7.1) */
  const tnum = trackEl.querySelector('.tnum');
  if (tnum) {
    trackEl.insertBefore(ind, tnum);
  } else {
    /* Fallback: вставляем первым дочерним */
    trackEl.insertBefore(ind, trackEl.firstChild);
  }

  return ind;
}

/**
 * Удаляет все state-классы с элемента .offline-ind.
 */
function _clearStateClasses(ind) {
  const toRemove = [];
  ind.classList.forEach(cls => {
    if (cls.startsWith(STATE_CLASS_PREFIX)) toRemove.push(cls);
  });
  toRemove.forEach(cls => ind.classList.remove(cls));
}

/**
 * Обновляет один индикатор для конкретного .track[data-uid] элемента.
 */
function _updateIndicator(trackEl) {
  const uid = trackEl.dataset.uid;
  if (!uid) return;

  const ind = _ensureIndicatorElement(trackEl);
  const { stateClass, icon, clickAction } = _resolveVisualState(uid);

  /* Обновляем визуал */
  _clearStateClasses(ind);
  ind.classList.add(STATE_CLASS_PREFIX + stateClass);
  ind.textContent = icon;
  ind.dataset.clickAction = clickAction;
  ind.dataset.uid = uid;
}

/* ── Клик-обработчик (делегирование) ─────────────────── */

/**
 * Единый обработчик кликов по .offline-ind (делегированный на document).
 * Логика по П.4.2–П.4.4, П.5.5.
 */
function _handleIndicatorClick(e) {
  const ind = e.target.closest('.offline-ind');
  if (!ind) return;

  e.stopPropagation(); /* Не прокидываем клик на .track (не запускаем воспроизведение) */
  e.preventDefault();

  const uid = ind.dataset.uid;
  const action = ind.dataset.clickAction;

  if (!uid || !action) return;

  switch (action) {
    /* Серый 🔒 → начать пиннинг (П.4.3) */
    case 'pin':
      OfflineManager.togglePinned(uid).then(result => {
        if (result.success) {
          _toast('Трек будет доступен офлайн. Начинаю скачивание…');
          refreshIndicator(uid);
        }
      });
      break;

    /* Жёлтый 🔒 → снять пиннинг (П.4.4) */
    case 'unpin': {
      const D = OfflineManager.getCloudD();
      OfflineManager.togglePinned(uid).then(result => {
        if (result.success) {
          _toast(`Офлайн-закрепление снято. Трек доступен как облачный кэш на ${D} дней.`);
          refreshIndicator(uid);
        }
      });
      break;
    }

    /* Голубой ☁ → cloud-menu (П.5.5) */
    case 'cloud-menu':
      showCloudMenu(uid, ind);
      break;

    /* Нет места (П.2) */
    case 'no-space':
      _toast('Недостаточно места на устройстве. Освободите память для офлайн-кэша.');
      break;
  }
}

/* ── Публичный API ────────────────────────────────────── */

/**
 * Обновить индикатор для одного uid во всех трек-листах (альбомы + favorites).
 * Вызывается событийно при изменении состояния трека (П.7.4).
 */
export function refreshIndicator(uid) {
  const trackEls = document.querySelectorAll(`.track[data-uid="${uid}"]`);
  trackEls.forEach(el => _updateIndicator(el));
}

/**
 * Обновить все индикаторы на странице.
 * Вызывается при старте приложения и при массовых изменениях (П.7.4).
 */
export function refreshAllIndicators() {
  const trackEls = document.querySelectorAll('.track[data-uid]');
  trackEls.forEach(el => _updateIndicator(el));
}

/**
 * Инициализация модуля: навешиваем делегированный обработчик клика.
 * Вызывается один раз при старте приложения.
 */
export function initOfflineIndicators() {
  document.addEventListener('click', _handleIndicatorClick);

  /* Слушаем событие изменения состояния кэша (событийная модель, не таймер) */
  window.addEventListener('offline-state-changed', (e) => {
    if (e.detail && e.detail.uid) {
      refreshIndicator(e.detail.uid);
    } else {
      refreshAllIndicators();
    }
  });
}
