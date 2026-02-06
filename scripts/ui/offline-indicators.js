/**
 * offline-indicators.js — Рендеринг индикаторов 🔒 / ☁ / ⏳
 *
 * ТЗ: П.6, П.6.1–П.6.4
 *
 * Вешает на каждый .track-row индикатор-бейдж.
 * Слушает offline:stateChanged для обновления.
 */

import { getOfflineManager } from '../offline/offline-manager.js';
import { showCloudMenu } from './cloud-menu.js';

const BADGE_CLASS = 'offline-indicator-badge';

/* ═══════ Публичные API ═══════ */

/**
 * Инжектирует индикатор в один .track-row.
 * Вызывается из albums.js при рендере треков.
 */
export async function injectIndicator(trackRowEl) {
  if (!trackRowEl) return;
  const uid = trackRowEl.dataset?.uid || trackRowEl.dataset?.trackUid;
  if (!uid) return;

  /* Удалим старый бейдж */
  trackRowEl.querySelector(`.${BADGE_CLASS}`)?.remove();

  const mgr = getOfflineManager();
  const state = await mgr.getTrackOfflineState(uid);

  if (state.cacheKind === 'none' && !state.downloading) return;

  const badge = document.createElement('span');
  badge.className = BADGE_CLASS;
  badge.dataset.uid = uid;

  if (state.downloading) {
    badge.textContent = '⏳';
    badge.title = 'Скачивается…';
    badge.classList.add('indicator--downloading');
  } else if (state.pinned) {
    badge.textContent = '🔒';
    badge.title = 'Закреплён офлайн';
    badge.classList.add('indicator--pinned');
    if (state.needsReCache) {
      badge.classList.add('indicator--needs-recache');
      badge.title += ' (нужен re-cache)';
    }
  } else if (state.cloud) {
    badge.textContent = '☁';
    badge.title = 'Облачный кэш';
    badge.classList.add('indicator--cloud');
    if (state.needsReCache) {
      badge.classList.add('indicator--needs-recache');
      badge.title += ' (нужен re-cache)';
    }
  } else {
    return; /* нет индикатора */
  }

  /* Правый клик → контекстное меню (ТЗ П.6.3) */
  badge.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    showCloudMenu(uid, badge);
  });

  /* Клик → toggle pinned (ТЗ П.6.2) */
  badge.addEventListener('click', async (e) => {
    e.stopPropagation();
    await mgr.togglePinned(uid);
    await injectIndicator(trackRowEl);
  });

  /* Вставляем в track-row */
  const titleEl = trackRowEl.querySelector('.track-title, .track-name, td:first-child');
  if (titleEl) {
    titleEl.insertAdjacentElement('afterend', badge);
  } else {
    trackRowEl.prepend(badge);
  }
}

/**
 * Обновляет все видимые индикаторы.
 */
export async function refreshAllIndicators() {
  const rows = document.querySelectorAll('.track-row[data-uid], .track-row[data-track-uid], tr[data-uid]');
  for (const row of rows) {
    await injectIndicator(row);
  }
}

/**
 * Инициализация — подписка на события.
 */
export function initOfflineIndicators() {
  window.addEventListener('offline:stateChanged', () => {
    refreshAllIndicators();
  });

  window.addEventListener('offline:trackCached', (e) => {
    const uid = e.detail?.uid;
    if (uid) {
      const row = document.querySelector(`.track-row[data-uid="${uid}"], tr[data-uid="${uid}"]`);
      if (row) injectIndicator(row);
    }
  });

  /* Первоначальная отрисовка */
  refreshAllIndicators();
}

export default {
  injectIndicator,
  refreshAllIndicators,
  initOfflineIndicators
};
