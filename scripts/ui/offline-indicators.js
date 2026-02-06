/**
 * offline-indicators.js — Индикаторы офлайн-состояния на карточках треков
 * ТЗ 19.2: Визуальная индикация кэшированных/закреплённых треков
 */

import { getOfflineManager } from '../offline/offline-manager.js';

let _refreshTimer = null;

export function initOfflineIndicators() {
  const mgr = getOfflineManager();

  // Обновляем при смене режима
  window.addEventListener('offline:modeChanged', () => refreshAllIndicators());
  window.addEventListener('offline:uiChanged', () => refreshAllIndicators());
  window.addEventListener('offline:trackCached', (e) => refreshIndicator(e.detail?.uid));
  window.addEventListener('offline:trackRemoved', (e) => refreshIndicator(e.detail?.uid));

  // Первичное обновление
  refreshAllIndicators();

  // Периодическое обновление (новые карточки могут появиться)
  _refreshTimer = setInterval(refreshAllIndicators, 5000);

  console.log('[OfflineIndicators] initialized');
}

async function refreshAllIndicators() {
  const mgr = getOfflineManager();
  if (mgr.getMode() === 'R0') {
    // Убираем все индикаторы
    document.querySelectorAll('.offline-indicator').forEach(el => el.remove());
    return;
  }

  const cards = document.querySelectorAll('[data-uid], [data-track-uid]');
  for (const card of cards) {
    const uid = card.dataset.uid || card.dataset.trackUid;
    if (uid) await updateCardIndicator(card, uid);
  }
}

async function refreshIndicator(uid) {
  if (!uid) return;
  const cards = document.querySelectorAll(`[data-uid="${uid}"], [data-track-uid="${uid}"]`);
  for (const card of cards) {
    await updateCardIndicator(card, uid);
  }
}

async function updateCardIndicator(card, uid) {
  const mgr = getOfflineManager();

  // Удаляем старый индикатор
  const old = card.querySelector('.offline-indicator');
  if (old) old.remove();

  if (mgr.getMode() === 'R0') return;

  try {
    const state = await mgr.getTrackOfflineState(uid);
    if (!state) return;

    let icon = '';
    let title = '';
    let color = '';

    if (state.pinned) {
      icon = '📌';
      title = 'Закреплён офлайн';
      color = '#fdcb6e';
    } else if (state.cloud) {
      icon = '☁️';
      title = 'В облачном кэше';
      color = '#74b9ff';
    } else if (state.cachedComplete > 0) {
      icon = '💾';
      title = `Кэш: ${state.cachedComplete}%`;
      color = '#a29bfe';
    } else {
      return; // Нет кэша — нет индикатора
    }

    const indicator = document.createElement('span');
    indicator.className = 'offline-indicator';
    indicator.textContent = icon;
    indicator.title = title;
    indicator.style.cssText = `
      position:absolute; top:4px; left:4px; font-size:12px;
      z-index:10; cursor:pointer; filter:drop-shadow(0 1px 2px rgba(0,0,0,0.5));
      line-height:1;
    `;

    // Клик — toggle pinned
    indicator.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      await mgr.togglePinned(uid);
      await refreshIndicator(uid);
    });

    card.style.position = card.style.position || 'relative';
    card.appendChild(indicator);
  } catch (err) {
    // Молча игнорируем
  }
}

export function destroyOfflineIndicators() {
  if (_refreshTimer) { clearInterval(_refreshTimer); _refreshTimer = null; }
  document.querySelectorAll('.offline-indicator').forEach(el => el.remove());
}

export default initOfflineIndicators;
