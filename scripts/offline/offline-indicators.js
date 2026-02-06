/**
 * offline-indicators.js — Индикаторы 🔒/☁ в трек-листе.
 *
 * Добавляет <span class="offline-ind"> перед .tnum в каждом .track.
 * Обновляется по событиям (не по таймеру).
 *
 * Состояния:
 *   🔒 серый (state="none")      — нет кэша, клик → togglePinned
 *   🔒 жёлтый (state="pinned")   — pinned, клик → снять пиннинг
 *   🔒 мигает (state="pinned" + downloading) — качается
 *   ☁ голубой (state="cloud")    — cloud 100%, клик → cloud-menu
 */

import offlineManager from './offline-manager.js';
import { showCloudMenu } from './cloud-menu.js';

const IND_CLASS = 'offline-ind';
const ICON_LOCK = '\u{1F512}';
const ICON_CLOUD = '\u2601';

/* ═══════ Создание индикатора ═══════ */

function createIndicator(uid) {
  const span = document.createElement('span');
  span.className = IND_CLASS;
  span.textContent = ICON_LOCK;
  span.dataset.uid = uid || '';
  span.dataset.state = 'none';
  span.addEventListener('click', onIndicatorClick);
  return span;
}

/* ═══════ Обновление одного индикатора ═══════ */

async function updateIndicator(span) {
  const uid = span?.dataset?.uid;
  if (!uid) return;

  const state = await offlineManager.getTrackOfflineState(uid);

  span.classList.remove('pinned', 'cloud', 'downloading');

  if (state.pinned) {
    span.textContent = ICON_LOCK;
    span.dataset.state = 'pinned';
    span.classList.add('pinned');
    if (state.downloading) span.classList.add('downloading');
  } else if (state.cloud && state.cachedComplete === 100) {
    span.textContent = ICON_CLOUD;
    span.dataset.state = 'cloud';
    span.classList.add('cloud');
  } else {
    span.textContent = ICON_LOCK;
    span.dataset.state = 'none';
  }
}

/* ═══════ Клик по индикатору ═══════ */

function onIndicatorClick(e) {
  e.stopPropagation();
  e.preventDefault();

  const span = e.currentTarget;
  const uid = span?.dataset?.uid;
  if (!uid) return;

  const state = span.dataset.state;

  if (state === 'cloud') {
    showCloudMenu(uid, span);
  } else {
    // none → pin, pinned → unpin (оба через togglePinned)
    offlineManager.togglePinned(uid);
  }
}

/* ═══════ Вставка индикаторов в DOM ═══════ */

/**
 * Вставить индикатор в .track элемент, если его ещё нет.
 * Вызывается при рендере трек-листа.
 */
export function injectIndicator(trackEl, uid) {
  if (!trackEl || !uid) return;

  let ind = trackEl.querySelector('.' + IND_CLASS);
  if (ind) {
    ind.dataset.uid = uid;
  } else {
    ind = createIndicator(uid);
    const tnum = trackEl.querySelector('.tnum');
    if (tnum) {
      trackEl.insertBefore(ind, tnum);
    } else {
      trackEl.prepend(ind);
    }
  }

  updateIndicator(ind);
  return ind;
}

/* ═══════ Массовое обновление всех видимых индикаторов ═══════ */

export function refreshAllIndicators() {
  const indicators = document.querySelectorAll('.' + IND_CLASS);
  indicators.forEach(ind => updateIndicator(ind));
}

/**
 * Обновить индикатор конкретного uid (где бы он ни был в DOM).
 */
export function refreshIndicatorByUid(uid) {
  if (!uid) return;
  const indicators = document.querySelectorAll(`.${IND_CLASS}[data-uid="${uid}"]`);
  indicators.forEach(ind => updateIndicator(ind));
}

/* ═══════ Подписка на события ═══════ */

function setupEventListeners() {
  // Обновление всех при глобальном изменении состояния
  window.addEventListener('offline:stateChanged', () => refreshAllIndicators());

  // Обновление конкретного трека при завершении загрузки
  window.addEventListener('offline:trackCached', (e) => {
    const uid = e.detail?.uid;
    if (uid) refreshIndicatorByUid(uid);
  });

  // Обновление при удалении
  window.addEventListener('offline:trackRemoved', (e) => {
    const uid = e.detail?.uid;
    if (uid) refreshIndicatorByUid(uid);
  });
}

/* ═══════ Инициализация ═══════ */

export function initOfflineIndicators() {
  setupEventListeners();

  // Начальная простановка индикаторов для всех уже отрендеренных треков
  document.querySelectorAll('.track[data-uid]').forEach(el => {
    injectIndicator(el, el.dataset.uid);
  });
}

export default {
  injectIndicator,
  refreshAllIndicators,
  refreshIndicatorByUid,
  initOfflineIndicators
};
